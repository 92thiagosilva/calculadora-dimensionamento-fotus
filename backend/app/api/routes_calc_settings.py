"""Configuracoes de ajustes de calculo (area restrita) — sobrecarga,
tolerancias de Imax/Isc e deltas de tensao (V max / V MPP min / V MPP
max), globais ou por inversor especifico. Ver
app/domain/calculo_solar/calc_adjustments.py."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_restricted
from app.api.schemas import (
    CalcSettingsGlobalOut,
    CalcSettingsIn,
    InverterCalcSettingsRow,
    InverterOverrideOut,
    MpptCurrentsIO,
)
from app.infra import repository
from app.infra.db import get_session

router = APIRouter(prefix="/api/admin/calc-settings", tags=["calc-settings"])


@router.get("/global", response_model=CalcSettingsGlobalOut)
def get_global(db: Session = Depends(get_session), _user: CurrentUser = Depends(require_restricted)):
    row = repository.get_or_create_global_calc_settings(db)
    return CalcSettingsGlobalOut(
        overload_pct_override=row.overload_pct_override,
        imax_tolerance_a=row.imax_tolerance_a,
        isc_tolerance_a=row.isc_tolerance_a,
        vmax_delta_v=row.vmax_delta_v,
        vmpp_min_delta_v=row.vmpp_min_delta_v,
        vmpp_max_delta_v=row.vmpp_max_delta_v,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


@router.put("/global", response_model=CalcSettingsGlobalOut)
def put_global(
    body: CalcSettingsIn,
    db: Session = Depends(get_session),
    user: CurrentUser = Depends(require_restricted),
):
    data = body.model_dump(exclude_unset=True)
    # Campos globais nao podem ficar "vazios" (None) exceto overload_pct_override.
    for field in ("imax_tolerance_a", "isc_tolerance_a", "vmax_delta_v", "vmpp_min_delta_v", "vmpp_max_delta_v"):
        if data.get(field) is None and field in data:
            raise HTTPException(422, f"{field} nao pode ser nulo no ajuste global.")
    row = repository.update_global_calc_settings(db, data, user.email)
    return CalcSettingsGlobalOut(
        overload_pct_override=row.overload_pct_override,
        imax_tolerance_a=row.imax_tolerance_a,
        isc_tolerance_a=row.isc_tolerance_a,
        vmax_delta_v=row.vmax_delta_v,
        vmpp_min_delta_v=row.vmpp_min_delta_v,
        vmpp_max_delta_v=row.vmpp_max_delta_v,
        updated_at=row.updated_at,
        updated_by=row.updated_by,
    )


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
    row = repository.update_inverter_override(db, inverter_id, data, user.email)
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
