"""Configuracoes de ajustes de calculo (area restrita) — sobrecarga,
tolerancias de Imax/Isc e deltas de tensao (V max / V MPP min / V MPP
max), globais ou por inversor especifico. Ver
app/domain/calculo_solar/calc_adjustments.py."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_restricted
from app.api.error_mapper import map_tool_errors
from app.api.routes_dimensionamento import build_validation_response
from app.api.schemas import (
    AdjustmentRuleIO,
    CalcSettingsGlobalOut,
    CalcSettingsIn,
    InverterCalcSettingsRow,
    InverterOverrideOut,
    MpptCurrentsIO,
    RuleTestRequest,
)
import dataclasses

from app.domain.calculo_solar.calc_adjustments import build_adjusted_inverter
from app.domain.calculo_solar.conditional_rules import (
    apply_effects_detailed,
    apply_rules,
    evaluate_conditions,
    kit_context,
    rule_catalog,
    rule_from_dict,
    rule_in_scope,
    rule_to_dict,
    rules_from_json,
)
from app.domain.calculo_solar.calc_adjustments import overload_override_note
from app.domain.calculo_solar.mppt_limits import calculate_mppt_limits
from app.domain.calculo_solar.validate_kit import MpptConfigInput
from app.infra import repository
from app.infra.db import get_session

router = APIRouter(prefix="/api/admin/calc-settings", tags=["calc-settings"])


def _rules_out(raw) -> List[AdjustmentRuleIO]:
    return [AdjustmentRuleIO(**rule_to_dict(r)) for r in rules_from_json(raw)]


def _limits_summary(inv, mod, t_min: float, t_max: float, adjustments, ctx) -> dict:
    """Limites do MPPT 1 para o kit `ctx`, com ajustes estaticos + as regras
    de `adjustments` que o kit atende."""
    static_inv = build_adjusted_inverter(inv, adjustments)
    final_inv, applied = apply_rules(static_inv, adjustments.rules, ctx)
    lim = calculate_mppt_limits(final_inv, mod, t_min, t_max, 0)
    return {
        "applied": bool(applied),
        "v_max": final_inv.v_max,
        "overload_limit_kw": None if final_inv.p_max_cc is None else final_inv.p_max_cc / 1000,
        "min_series": lim.min_series,
        "max_series": lim.max_series,
        "max_strings": lim.max_strings,
    }


@router.post("/test-rule")
def test_rule(
    body: RuleTestRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(require_restricted),
) -> dict:
    """Testa uma regra condicional ainda nao salva: compara o resultado SEM
    a regra e COM ela (so ela — as outras regras do inversor ficam de fora
    para isolar o efeito) para um kit escolhido. Somente leitura."""
    inv = repository.get_inverter(db, body.inverter_id)
    if inv is None:
        raise HTTPException(404, "Inversor nao encontrado")
    mod = repository.get_module(db, body.module_id)
    if mod is None:
        raise HTTPException(404, "Modulo nao encontrado")

    rule = rule_from_dict(body.rule.model_dump())
    base_adj = dataclasses.replace(repository.get_effective_adjustments(db, body.inverter_id), rules=())
    in_scope = rule_in_scope(rule, body.inverter_id)
    draft_adj = dataclasses.replace(base_adj, rules=(rule,) if in_scope else ())
    overload_source = repository.overload_override_source(db, body.inverter_id)

    cfg = None
    total_mods = None
    if body.total_kwp is not None:
        total_w = body.total_kwp * 1000
    else:
        used = min(body.mppt_count or inv.num_mppt, inv.num_mppt)
        cfg = [
            MpptConfigInput(series=body.series, strings=body.strings) if i < used else None  # type: ignore[arg-type]
            for i in range(inv.num_mppt)
        ]
        total_mods = used * body.series * body.strings  # type: ignore[operator]
        total_w = total_mods * mod.pnom
    ctx = kit_context(total_w, inv.p_nom)

    with map_tool_errors():
        _, changes = apply_effects_detailed(build_adjusted_inverter(inv, base_adj), rule)
        outcome = {}
        for key, adj in (("without_rule", base_adj), ("with_rule", draft_adj)):
            item = {"limits": _limits_summary(inv, mod, body.t_min, body.t_max, adj, ctx), "validation": None}
            if cfg is not None:
                v = build_validation_response(inv, mod, body.t_min, body.t_max, cfg, adj, overload_source)
                item["validation"] = {
                    "overall_badge": v["overall_badge"],
                    "overload_fail": v["overload_fail"],
                    "all_mppt_ok": v["all_mppt_ok"],
                    "total_kwp": v["total_kwp"],
                    "ressalva_reasons": v["ressalva_reasons"],
                    "dc_ac_ratio_note": v.get("dc_ac_ratio_note"),
                }
            outcome[key] = item

    conditions = [vars(c) for c in evaluate_conditions(rule, ctx)]
    return {
        "inverter": {
            "brand": inv.brand,
            "model": inv.model,
            "p_nom_kw": inv.p_nom / 1000,
            "num_mppt": inv.num_mppt,
        },
        "kit": {
            "total_kwp": total_w / 1000,
            "total_mods": total_mods,
            "overload_pct": (total_w / inv.p_nom - 1) * 100 if inv.p_nom > 0 else 0.0,
        },
        "rule_enabled": rule.enabled,
        "rule_in_scope": in_scope,
        "overload_override": overload_override_note(inv, base_adj, overload_source),
        "rule_applies": outcome["with_rule"]["limits"]["applied"],
        "conditions": conditions,
        "effects": [
            {"target": c.target, "label": c.label, "unit": c.unit, "mode": c.mode, "before": list(c.before), "after": list(c.after)}
            for c in changes
        ],
        **outcome,
    }


def _global_out(row) -> CalcSettingsGlobalOut:
    return CalcSettingsGlobalOut(
        overload_pct_override=row.overload_pct_override,
        imax_tolerance_a=row.imax_tolerance_a,
        isc_tolerance_a=row.isc_tolerance_a,
        vmax_delta_v=row.vmax_delta_v,
        vmpp_min_delta_v=row.vmpp_min_delta_v,
        vmpp_max_delta_v=row.vmpp_max_delta_v,
        dc_ac_ratio_min_pct_override=row.dc_ac_ratio_min_pct_override,
        conditional_rules=_rules_out(row.conditional_rules),
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.get("/rule-catalog")
def get_rule_catalog(_user: CurrentUser = Depends(require_restricted)) -> dict:
    """Metricas, operadores, alvos e modos disponiveis para montar uma
    regra condicional — o editor da tela de Configuracoes le daqui."""
    return rule_catalog()


@router.get("/global", response_model=CalcSettingsGlobalOut)
def get_global(db: Session = Depends(get_session), _user: CurrentUser = Depends(require_restricted)):
    row = repository.get_or_create_global_calc_settings(db)
    return _global_out(row)


@router.put("/global", response_model=CalcSettingsGlobalOut)
def put_global(
    body: CalcSettingsIn,
    db: Session = Depends(get_session),
    user: CurrentUser = Depends(require_restricted),
):
    data = body.model_dump(exclude_unset=True)
    # Campos globais nao podem ficar "vazios" (None) exceto overload_pct_override
    # e dc_ac_ratio_min_pct_override (None = usa o padrao de 70%).
    for field in ("imax_tolerance_a", "isc_tolerance_a", "vmax_delta_v", "vmpp_min_delta_v", "vmpp_max_delta_v"):
        if data.get(field) is None and field in data:
            raise HTTPException(422, f"{field} nao pode ser nulo no ajuste global.")
    try:
        row = repository.update_global_calc_settings(db, data, user.email)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return _global_out(row)


def _override_out(row) -> Optional[InverterOverrideOut]:
    if row is None:
        return None
    return InverterOverrideOut(
        inverter_id=row.inverter_id,
        overload_pct_override=row.overload_pct_override,
        imax_tolerance_a=row.imax_tolerance_a,
        isc_tolerance_a=row.isc_tolerance_a,
        vmax_delta_v=row.vmax_delta_v,
        vmpp_min_delta_v=row.vmpp_min_delta_v,
        vmpp_max_delta_v=row.vmpp_max_delta_v,
        dc_ac_ratio_min_pct_override=row.dc_ac_ratio_min_pct_override,
        conditional_rules=None if row.conditional_rules is None else _rules_out(row.conditional_rules),
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.get("/inverters", response_model=List[InverterCalcSettingsRow])
def list_inverters(
    brand: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(require_restricted),
):
    inverters = repository.list_inverters(db)
    if brand:
        inverters = [i for i in inverters if i.brand.upper() == brand.upper()]
    if search:
        s = search.lower()
        inverters = [i for i in inverters if s in i.model.lower() or s in i.brand.lower()]

    rows = []
    for inv in inverters:
        override = repository.get_inverter_override(db, inv.inverter_id)
        rows.append(
            InverterCalcSettingsRow(
                inverter_id=inv.inverter_id,
                brand=inv.brand,
                model=inv.model,
                p_nom=inv.p_nom,
                p_max_cc=inv.p_max_cc,
                v_max=inv.v_max,
                v_mpp_min=inv.v_mpp_min,
                v_mpp_max=inv.v_mpp_max,
                num_mppt=inv.num_mppt,
                mppt_currents=[MpptCurrentsIO(imax=c.imax, isc=c.isc) for c in inv.mppt_currents],
                override=_override_out(override),
            )
        )
    return rows


@router.put("/inverters/{inverter_id}", response_model=InverterOverrideOut)
def put_inverter_override(
    inverter_id: int,
    body: CalcSettingsIn,
    db: Session = Depends(get_session),
    user: CurrentUser = Depends(require_restricted),
):
    if repository.get_inverter(db, inverter_id) is None:
        raise HTTPException(404, "Inversor nao encontrado")
    data = body.model_dump(exclude_unset=True)
    try:
        row = repository.update_inverter_override(db, inverter_id, data, user.email)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return _override_out(row)


@router.delete("/inverters/{inverter_id}")
def delete_inverter_override(
    inverter_id: int,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(require_restricted),
):
    ok = repository.delete_inverter_override(db, inverter_id)
    if not ok:
        raise HTTPException(404, "Este inversor nao tem override configurado")
    return {"ok": True}
