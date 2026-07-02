"""Conversao entre linhas do ORM (SQLAlchemy) e dataclasses puras do
dominio (app.domain.catalogo). Mantem o dominio livre de dependencia
de infraestrutura (SQLAlchemy), conforme principio de inversao de
dependencia herdado do projeto de origem."""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.domain.catalogo.inverter import Inverter, MpptCurrents
from app.domain.catalogo.module import Module
from app.infra.models import InverterRow, ModuleRow


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
