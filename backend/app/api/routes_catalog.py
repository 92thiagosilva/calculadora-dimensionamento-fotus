from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.schemas import InverterOut, ModuleOut, ThermalRegionOut
from app.domain.catalogo.thermal_region import THERMAL_REGIONS
from app.infra import repository
from app.infra.db import get_session

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/modules", response_model=List[ModuleOut])
def get_modules(
    brand: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> List[ModuleOut]:
    modules = repository.list_modules(db)
    if brand:
        modules = [m for m in modules if m.brand.upper() == brand.upper()]
    if search:
        s = search.lower()
        modules = [m for m in modules if s in m.label.lower()]
    return [ModuleOut(**vars(m)) for m in modules]


@router.get("/inverters", response_model=List[InverterOut])
def get_inverters(
    brand: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> List[InverterOut]:
    inverters = repository.list_inverters(db)
    if brand:
        inverters = [i for i in inverters if i.brand.upper() == brand.upper()]
    if search:
        s = search.lower()
        inverters = [i for i in inverters if s in i.model.lower()]
    out = []
    for i in inverters:
        d = vars(i).copy()
        d["mppt_currents"] = [vars(c) for c in i.mppt_currents]
        out.append(InverterOut(**d))
    return out


@router.get("/regions", response_model=List[ThermalRegionOut])
def get_regions(_user: CurrentUser = Depends(get_current_user)) -> List[ThermalRegionOut]:
    return [ThermalRegionOut(**vars(r)) for r in THERMAL_REGIONS]


@router.get("/brands")
def get_brands(db: Session = Depends(get_session), _user: CurrentUser = Depends(get_current_user)) -> dict:
    return repository.list_brands(db)
