from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.error_mapper import map_tool_errors
from app.api.schemas import (
    AutoConfigRequest,
    CorrectModuleSpecsRequest,
    SuggestKitRequest,
    ValidateKitRequest,
)
from app.domain.calculo_solar.auto_config import auto_config_strings
from app.domain.calculo_solar.calc_adjustments import (
    CalcAdjustments,
    build_adjusted_inverter,
    check_dc_ac_ratio_with_adjustments,
    validate_kit_with_adjustments,
)
from app.domain.calculo_solar.commercial_rules import recompute_badge_from_per_mppt
from app.domain.calculo_solar.corrections import apply_module_corrections
from app.domain.calculo_solar.mppt_limits import calculate_mppt_limits
from app.domain.calculo_solar.suggestion import suggest_kit
from app.domain.calculo_solar.validate_kit import MpptConfigInput
from app.infra import repository
from app.infra.db import get_session

router = APIRouter(prefix="/api/dimensionamento", tags=["dimensionamento"])


def _apply_dc_ac_ratio_rule(out: dict, inv, adjustments: CalcAdjustments) -> None:
    """Aplica a regra comercial Fotus (modulos >= X% da potencia nominal
    do inversor, X=70 por padrao mas configuravel — ver calc_adjustments)
    por cima do resultado do motor canonico, sem alterar a logica
    bit-exata de `validate_kit`. Sobrescreve `overall_badge` para
    'Reprovado' quando a regra falha (mesmo que o motor canonico tivesse
    aprovado), preservando o badge original em `formula_badge` para
    referencia/depuracao. Quando um percentual configurado (menor que o
    padrao) e o motivo da aprovacao, adiciona um motivo de ressalva em
    vez de aprovar silenciosamente."""
    check, effective_pct, ressalva_reason = check_dc_ac_ratio_with_adjustments(
        out["total_kwp"], inv.p_nom, adjustments
    )
    out["formula_badge"] = out["overall_badge"]
    out["dc_ac_ratio_ok"] = check.ok
    out["dc_ac_min_kwp_required"] = check.min_kwp_required
    if not check.ok:
        out["overall_badge"] = "Reprovado"
        out["dc_ac_ratio_note"] = (
            f"Abaixo de {effective_pct:.0f}% da potência nominal do inversor: {out['total_kwp']:.2f} kWp de "
            f"módulos < {check.min_kwp_required:.2f} kWp mínimos exigidos ({effective_pct:.0f}% de "
            f"{inv.p_nom / 1000:.1f} kW). Adicione mais módulos ou escolha um inversor menor."
        )
    else:
        out["dc_ac_ratio_note"] = None
        if ressalva_reason:
            out.setdefault("ressalva_reasons", []).append(ressalva_reason)
            if out["overall_badge"] == "Aprovado":
                out["overall_badge"] = "Aprovado com ressalva"


def _get_module(db: Session, module_id: int):
    mod = repository.get_module(db, module_id)
    if mod is None:
        raise HTTPException(404, f"Modulo {module_id} nao encontrado")
    return mod


def _get_inverter(db: Session, inverter_id: int):
    inv = repository.get_inverter(db, inverter_id)
    if inv is None:
        raise HTTPException(404, f"Inversor {inverter_id} nao encontrado")
    return inv


@router.post("/correct-module-specs")
def correct_module_specs(
    body: CorrectModuleSpecsRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    mod = _get_module(db, body.module_id)
    with map_tool_errors():
        result = apply_module_corrections(mod, body.t_min, body.t_max)
    return vars(result)


@router.get("/effective-adjustments")
def effective_adjustments(
    inverter_id: int,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Ajustes de calculo efetivos (global + override, ja mesclados)
    para este inversor — usado pelo frontend para explicar ao vendedor,
    em tempo real, o motivo de uma eventual ressalva (ex.: qual e a
    tolerancia de Imax configurada)."""
    _get_inverter(db, inverter_id)
    adj = repository.get_effective_adjustments(db, inverter_id)
    return vars(adj)


@router.get("/mppt-limits")
def mppt_limits(
    inverter_id: int,
    module_id: int,
    t_min: float,
    t_max: float,
    mppt_idx: int,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    inv = _get_inverter(db, inverter_id)
    mod = _get_module(db, module_id)
    adjustments = repository.get_effective_adjustments(db, inverter_id)
    adjusted_inv = build_adjusted_inverter(inv, adjustments)
    with map_tool_errors():
        result = calculate_mppt_limits(adjusted_inv, mod, t_min, t_max, mppt_idx)
    return vars(result)


@router.post("/auto-config-strings")
def auto_config(
    body: AutoConfigRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    inv = _get_inverter(db, body.inverter_id)
    mod = _get_module(db, body.module_id)
    adjustments = repository.get_effective_adjustments(db, body.inverter_id)
    adjusted_inv = build_adjusted_inverter(inv, adjustments)
    with map_tool_errors():
        result = auto_config_strings(adjusted_inv, mod, body.t_min, body.t_max)
    return {"mppt_config": [vars(c) for c in result]}


@router.post("/validate-kit")
def validate_kit_endpoint(
    body: ValidateKitRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    inv = _get_inverter(db, body.inverter_id)
    mod = _get_module(db, body.module_id)
    cfg = [
        MpptConfigInput(series=c.series, strings=c.strings) if c is not None else None
        for c in body.mppt_config
    ]
    adjustments = repository.get_effective_adjustments(db, body.inverter_id)
    with map_tool_errors():
        result, ressalva_reasons = validate_kit_with_adjustments(inv, mod, body.t_min, body.t_max, cfg, adjustments)
    result = recompute_badge_from_per_mppt(result)
    out = vars(result).copy()
    out["per_mppt"] = [{**vars(p), "limits": vars(p.limits)} for p in result.per_mppt]
    if ressalva_reasons and out["overall_badge"] == "Aprovado":
        out["overall_badge"] = "Aprovado com ressalva"
    out["ressalva_reasons"] = ressalva_reasons
    _apply_dc_ac_ratio_rule(out, inv, adjustments)
    return out


@router.post("/suggest-kit")
def suggest_kit_endpoint(
    body: SuggestKitRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    modules = repository.list_modules(db)
    inverters = repository.list_inverters(db)
    adjustments_by_inverter_id = repository.get_all_effective_adjustments(db)
    with map_tool_errors():
        suggestions = suggest_kit(
            modules,
            inverters,
            body.t_min,
            body.t_max,
            target_kwp=body.target_kwp,
            target_inverter_kw=body.target_inverter_kw,
            module_brand=body.module_brand,
            inverter_brand=body.inverter_brand,
            inverter_phase=body.inverter_phase,  # type: ignore[arg-type]
            inverter_min_kw=body.inverter_min_kw,
            inverter_max_kw=body.inverter_max_kw,
            max_suggestions=body.max_suggestions,
            adjustments_by_inverter_id=adjustments_by_inverter_id,
        )
    result = []
    for s in suggestions:
        val = vars(s.validation).copy()
        val["per_mppt"] = [{**vars(p), "limits": vars(p.limits)} for p in s.validation.per_mppt]
        val["ressalva_reasons"] = s.ressalva_reasons
        result.append(
            {
                "module_id": s.module_id,
                "inverter_id": s.inverter_id,
                "mppt_config": [vars(c) for c in s.mppt_config],
                "validation": val,
                "score": s.score,
            }
        )
    return {"suggestions": result}
