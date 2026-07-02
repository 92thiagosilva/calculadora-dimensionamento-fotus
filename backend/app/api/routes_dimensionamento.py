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
from app.domain.calculo_solar.commercial_rules import apply_imax_tolerance, check_min_dc_ac_ratio
from app.domain.calculo_solar.corrections import apply_module_corrections
from app.domain.calculo_solar.mppt_limits import calculate_mppt_limits
from app.domain.calculo_solar.suggestion import suggest_kit
from app.domain.calculo_solar.validate_kit import MpptConfigInput, validate_kit
from app.infra import repository
from app.infra.db import get_session

router = APIRouter(prefix="/api/dimensionamento", tags=["dimensionamento"])


def _apply_dc_ac_ratio_rule(out: dict, inv) -> None:
    """Aplica a regra comercial Fotus (modulos >= 70% da potencia nominal
    do inversor) por cima do resultado do motor canonico, sem alterar a
    logica bit-exata de `validate_kit`. Sobrescreve `overall_badge` para
    'Reprovado' quando a regra falha (mesmo que o motor canonico tivesse
    aprovado), preservando o badge original em `formula_badge` para
    referencia/depuracao."""
    check = check_min_dc_ac_ratio(out["total_kwp"], inv.p_nom)
    out["formula_badge"] = out["overall_badge"]
    out["dc_ac_ratio_ok"] = check.ok
    out["dc_ac_min_kwp_required"] = check.min_kwp_required
    if not check.ok:
        out["overall_badge"] = "Reprovado"
        out["dc_ac_ratio_note"] = (
            f"Abaixo de 70% da potência nominal do inversor: {out['total_kwp']:.2f} kWp de módulos "
            f"< {check.min_kwp_required:.2f} kWp mínimos exigidos (70% de {inv.p_nom / 1000:.1f} kW). "
            "Adicione mais módulos ou escolha um inversor menor."
        )
    else:
        out["dc_ac_ratio_note"] = None


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
    with map_tool_errors():
        result = calculate_mppt_limits(inv, mod, t_min, t_max, mppt_idx)
    return vars(result)


@router.post("/auto-config-strings")
def auto_config(
    body: AutoConfigRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    inv = _get_inverter(db, body.inverter_id)
    mod = _get_module(db, body.module_id)
    with map_tool_errors():
        result = auto_config_strings(inv, mod, body.t_min, body.t_max)
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
    with map_tool_errors():
        result = validate_kit(inv, mod, body.t_min, body.t_max, cfg)
    result, tolerance_flags = apply_imax_tolerance(result)
    out = vars(result).copy()
    out["per_mppt"] = [
        {**vars(p), "limits": vars(p.limits), "imax_tolerance_applied": tolerance_flags[idx]}
        for idx, p in enumerate(result.per_mppt)
    ]
    _apply_dc_ac_ratio_rule(out, inv)
    return out


@router.post("/suggest-kit")
def suggest_kit_endpoint(
    body: SuggestKitRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    modules = repository.list_modules(db)
    inverters = repository.list_inverters(db)
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
        )
    result = []
    for s in suggestions:
        val = vars(s.validation).copy()
        val["per_mppt"] = [
            {**vars(p), "limits": vars(p.limits), "imax_tolerance_applied": s.imax_tolerance_flags[idx]}
            for idx, p in enumerate(s.validation.per_mppt)
        ]
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
