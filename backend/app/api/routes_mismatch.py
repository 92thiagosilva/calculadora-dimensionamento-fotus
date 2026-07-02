from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, require_restricted
from app.api.schemas import MismatchRequest
from app.domain.calculo_solar.mismatch import compute_mismatch
from app.infra import repository
from app.infra.db import get_session

router = APIRouter(prefix="/api/mismatch", tags=["mismatch"])


@router.post("/compare")
def compare_mismatch(
    body: MismatchRequest,
    db: Session = Depends(get_session),
    _user: CurrentUser = Depends(require_restricted),
) -> dict:
    original = repository.get_module(db, body.original_module_id)
    substituto = repository.get_module(db, body.substituto_module_id)
    if original is None or substituto is None:
        raise HTTPException(404, "Modulo original ou substituto nao encontrado")
    result = compute_mismatch(original, substituto)
    d = vars(result).copy()
    d["params"] = [vars(p) for p in result.params]
    return d
