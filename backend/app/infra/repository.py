"""Conversao entre linhas do ORM (SQLAlchemy) e dataclasses puras do
dominio (app.domain.catalogo). Mantem o dominio livre de dependencia
de infraestrutura (SQLAlchemy), conforme principio de inversao de
dependencia herdado do projeto de origem."""

from __future__ import annotations

import datetime as dt
from typing import List, Optional, Set

from sqlalchemy.orm import Session

from app.domain.calculo_solar.calc_adjustments import CalcAdjustments
from app.domain.catalogo.inverter import Inverter, MpptCurrents
from app.domain.catalogo.module import Module
from app.infra.models import (
    CalcSettingsGlobal,
    CalcSettingsInverterOverride,
    InverterRow,
    ModuleRow,
)


def _module_from_row(row: ModuleRow) -> Module:
    return Module(
        module_id=row.module_id,
        brand=row.brand,
        model=row.model,
        label=row.label,
        pnom=row.pnom,
        isc=row.isc,
        voc=row.voc,
        imp=row.imp,
        vmp=row.vmp,
        coef_v=row.coef_v,
        coef_i=row.coef_i,
        coef_pmp=row.coef_pmp,
        efic=row.efic,
        altura_mm=row.altura_mm,
        largura_mm=row.largura_mm,
        espessura_mm=row.espessura_mm,
        peso_kg=row.peso_kg,
    )


def _inverter_from_row(row: InverterRow) -> Inverter:
    return Inverter(
        inverter_id=row.inverter_id,
        brand=row.brand,
        model=row.model,
        categoria=row.categoria,  # type: ignore[arg-type]
        p_nom=row.p_nom,
        p_max_cc=row.p_max_cc,
        v_max=row.v_max,
        v_mpp_min=row.v_mpp_min,
        v_mpp_max=row.v_mpp_max,
        num_mppt=row.num_mppt,
        num_inputs=row.num_inputs or 0,
        mppt_currents=[MpptCurrents(imax=c["imax"], isc=c["isc"]) for c in row.mppt_currents],
        lin_max=list(row.lin_max),
        tensao=row.tensao,
        fase=row.fase,  # type: ignore[arg-type]
        protection=row.protection,
    )


def list_modules(db: Session) -> List[Module]:
    return [_module_from_row(r) for r in db.query(ModuleRow).order_by(ModuleRow.brand, ModuleRow.model).all()]


def get_module(db: Session, module_id: int) -> Optional[Module]:
    row = db.get(ModuleRow, module_id)
    return _module_from_row(row) if row else None


def list_inverters(db: Session) -> List[Inverter]:
    return [_inverter_from_row(r) for r in db.query(InverterRow).order_by(InverterRow.brand, InverterRow.model).all()]


def get_inverter(db: Session, inverter_id: int) -> Optional[Inverter]:
    row = db.get(InverterRow, inverter_id)
    return _inverter_from_row(row) if row else None


def list_brands(db: Session) -> dict:
    module_brands = sorted({b for (b,) in db.query(ModuleRow.brand).distinct()})
    inverter_brands = sorted({b for (b,) in db.query(InverterRow.brand).distinct()})
    return {"module_brands": module_brands, "inverter_brands": inverter_brands}


# ---- Ajustes de calculo (global + por inversor) ----

_CALC_ADJUSTMENT_FIELDS = (
    "overload_pct_override",
    "imax_tolerance_a",
    "isc_tolerance_a",
    "vmax_delta_v",
    "vmpp_min_delta_v",
    "vmpp_max_delta_v",
)


def get_or_create_global_calc_settings(db: Session) -> CalcSettingsGlobal:
    row = db.get(CalcSettingsGlobal, 1)
    if row is None:
        row = CalcSettingsGlobal(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def update_global_calc_settings(db: Session, data: dict, user_email: str) -> CalcSettingsGlobal:
    row = get_or_create_global_calc_settings(db)
    for field in _CALC_ADJUSTMENT_FIELDS:
        if field in data:
            setattr(row, field, data[field])
    row.updated_by = user_email
    row.updated_at = dt.datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def get_inverter_override(db: Session, inverter_id: int) -> Optional[CalcSettingsInverterOverride]:
    return db.get(CalcSettingsInverterOverride, inverter_id)


def update_inverter_override(
    db: Session, inverter_id: int, data: dict, user_email: str
) -> CalcSettingsInverterOverride:
    row = db.get(CalcSettingsInverterOverride, inverter_id)
    if row is None:
        row = CalcSettingsInverterOverride(inverter_id=inverter_id)
        db.add(row)
    for field in _CALC_ADJUSTMENT_FIELDS:
        if field in data:
            setattr(row, field, data[field])
    row.updated_by = user_email
    row.updated_at = dt.datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def delete_inverter_override(db: Session, inverter_id: int) -> bool:
    row = db.get(CalcSettingsInverterOverride, inverter_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def list_inverter_ids_with_overrides(db: Session) -> Set[int]:
    return {row_id for (row_id,) in db.query(CalcSettingsInverterOverride.inverter_id).all()}


def get_effective_adjustments(db: Session, inverter_id: int) -> CalcAdjustments:
    """Mescla o global com o override do inversor (override vence campo
    a campo quando nao-nulo; senao usa o global; o global sempre tem um
    valor concreto — nunca None, exceto overload_pct_override)."""
    global_row = get_or_create_global_calc_settings(db)
    override_row = get_inverter_override(db, inverter_id)
    return _merge_adjustments(global_row, override_row)


def _merge_adjustments(global_row: CalcSettingsGlobal, override_row) -> CalcAdjustments:
    def pick(field: str):
        if override_row is not None:
            value = getattr(override_row, field)
            if value is not None:
                return value
        return getattr(global_row, field)

    return CalcAdjustments(
        overload_pct_override=pick("overload_pct_override"),
        imax_tolerance_a=pick("imax_tolerance_a"),
        isc_tolerance_a=pick("isc_tolerance_a"),
        vmax_delta_v=pick("vmax_delta_v"),
        vmpp_min_delta_v=pick("vmpp_min_delta_v"),
        vmpp_max_delta_v=pick("vmpp_max_delta_v"),
    )


def get_all_effective_adjustments(db: Session) -> dict:
    """Versao em lote de `get_effective_adjustments` — 2 queries no
    total (global + todos os overrides), em vez de 2 por inversor.
    Usado por `suggest_kit`, que avalia centenas de inversores por
    busca."""
    global_row = get_or_create_global_calc_settings(db)
    overrides = {row.inverter_id: row for row in db.query(CalcSettingsInverterOverride).all()}
    inverter_ids = [iid for (iid,) in db.query(InverterRow.inverter_id).all()]
    return {
        inverter_id: _merge_adjustments(global_row, overrides.get(inverter_id))
        for inverter_id in inverter_ids
    }
