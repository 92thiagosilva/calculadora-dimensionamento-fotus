from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, get_current_user
from app.api.schemas import AreaCompareRequest
from app.domain.calculo_solar.area import compare_modules_area
from app.infra import repository
from app.infra.db import get_session

router = APIRouter(prefix="/api/area", tags=["area"])


@router.post("/compare")
def compare_area(
    body: AreaCompareRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(get_current_user),
) -> dict:
    modules = [repository.get_module(db, mid) for mid in body.module_ids]
    missing = [mid for mid, m in zip(body.module_ids, modules) if m is None]
    if missing:
        raise HTTPException(404, f"Modulos nao encontrados: {missing}")
    results = compare_modules_area(modules, target_kwp=body.target_kwp, area_util_m2=body.area_util_m2)
    return {"results": [vars(r) for r in results]}
