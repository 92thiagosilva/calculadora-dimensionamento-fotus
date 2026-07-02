"""CRUD do BD (modulos e inversores) — area restrita (sem acesso do
time comercial). Toda mutacao gera um registro em `audit_log`."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_restricted
from app.api.schemas import InverterIn, InverterOut, ModuleIn, ModuleOut
from app.infra import repository
from app.infra.db import get_session
from app.infra.models import AuditLogEntry, InverterRow, ModuleRow

router = APIRouter(prefix="/api/bd", tags=["bd"])


def _log(db: Session, user: CurrentUser, action: str, entity_type: str, entity_id: int, detail: str = "") -> None:
    db.add(
        AuditLogEntry(
            user_email=user.email,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            detail=detail,
        )
    )


# ---- Modules ----


@router.get("/modules", response_model=List[ModuleOut])
def list_modules(db: Session = Depends(get_session), _user: CurrentUser = Depends(require_restricted)):
    return [ModuleOut(**vars(m)) for m in repository.list_modules(db)]


@router.post("/modules", response_model=ModuleOut)
def create_module(body: ModuleIn, db: Session = Depends(get_session), user: CurrentUser = Depends(require_restricted)):
    row = ModuleRow(label=f"{body.brand} | {body.model}", **body.model_dump())
    db.add(row)
    db.flush()
    _log(db, user, "create", "module", row.module_id, row.label)
    db.commit()
    return ModuleOut(**vars(repository.get_module(db, row.module_id)))


@router.put("/modules/{module_id}", response_model=ModuleOut)
def update_module(
    module_id: int,
    body: ModuleIn,
    db: Session = Depends(get_session),
    user: CurrentUser = Depends(require_restricted),
):
    row = db.get(ModuleRow, module_id)
    if row is None:
        raise HTTPException(404, "Modulo nao encontrado")
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    row.label = f"{body.brand} | {body.model}"
    _log(db, user, "update", "module", module_id, row.label)
    db.commit()
    return ModuleOut(**vars(repository.get_module(db, module_id)))


@router.delete("/modules/{module_id}")
def delete_module(module_id: int, db: Session = Depends(get_session), user: CurrentUser = Depends(require_restricted)):
    row = db.get(ModuleRow, module_id)
    if row is None:
        raise HTTPException(404, "Modulo nao encontrado")
    _log(db, user, "delete", "module", module_id, row.label)
    db.delete(row)
    db.commit()
    return {"ok": True}


# ---- Inverters ----


@router.get("/inverters", response_model=List[InverterOut])
def list_inverters(db: Session = Depends(get_session), _user: CurrentUser = Depends(require_restricted)):
    out = []
    for i in repository.list_inverters(db):
        d = vars(i).copy()
        d["mppt_currents"] = [vars(c) for c in i.mppt_currents]
        out.append(InverterOut(**d))
    return out


@router.post("/inverters", response_model=InverterOut)
def create_inverter(
    body: InverterIn, db: Session = Depends(get_session), user: CurrentUser = Depends(require_restricted)
):
    data = body.model_dump()
    data["mppt_currents"] = [c for c in data["mppt_currents"]]
    row = InverterRow(**data)
    db.add(row)
    db.flush()
    _log(db, user, "create", "inverter", row.inverter_id, f"{body.brand} | {body.model}")
    db.commit()
    inv = repository.get_inverter(db, row.inverter_id)
    d = vars(inv).copy()
    d["mppt_currents"] = [vars(c) for c in inv.mppt_currents]
    return InverterOut(**d)


@router.put("/inverters/{inverter_id}", response_model=InverterOut)
def update_inverter(
    inverter_id: int,
    body: InverterIn,
    db: Session = Depends(get_session),
    user: CurrentUser = Depends(require_restricted),
):
    row = db.get(InverterRow, inverter_id)
    if row is None:
        raise HTTPException(404, "Inversor nao encontrado")
    data = body.model_dump()
    for k, v in data.items():
        setattr(row, k, v)
    _log(db, user, "update", "inverter", inverter_id, f"{body.brand} | {body.model}")
    db.commit()
    inv = repository.get_inverter(db, inverter_id)
    d = vars(inv).copy()
    d["mppt_currents"] = [vars(c) for c in inv.mppt_currents]
    return InverterOut(**d)


@router.delete("/inverters/{inverter_id}")
def delete_inverter(
    inverter_id: int, db: Session = Depends(get_session), user: CurrentUser = Depends(require_restricted)
):
    row = db.get(InverterRow, inverter_id)
    if row is None:
        raise HTTPException(404, "Inversor nao encontrado")
    _log(db, user, "delete", "inverter", inverter_id, f"{row.brand} | {row.model}")
    db.delete(row)
    db.commit()
    return {"ok": True}
