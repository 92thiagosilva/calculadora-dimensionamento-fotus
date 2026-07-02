from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import CurrentUser, AUTH_MODE, get_current_user, require_restricted
from app.api.schemas import MeOut
from app.infra.db import get_session
from app.infra.models import AuthorizedUser

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser = Depends(get_current_user)) -> MeOut:
    return MeOut(email=user.email, name=user.name, role=user.role)  # type: ignore[arg-type]


@router.get("/mode")
def auth_mode() -> dict:
    return {"mode": AUTH_MODE}


class AuthorizedUserIn(BaseModel):
    email: str
    role: str = "restrito"


@router.get("/authorized-users")
def list_authorized(db: Session = Depends(get_session), _user: CurrentUser = Depends(require_restricted)) -> List[dict]:
    return [{"email": r.email, "role": r.role} for r in db.query(AuthorizedUser).all()]


@router.post("/authorized-users")
def add_authorized(
    body: AuthorizedUserIn, db: Session = Depends(get_session), _user: CurrentUser = Depends(require_restricted)
) -> dict:
    email = body.email.lower()
    existing = db.query(AuthorizedUser).filter(AuthorizedUser.email == email).first()
    if existing:
        existing.role = body.role
    else:
        db.add(AuthorizedUser(email=email, role=body.role))
    db.commit()
    return {"ok": True}


@router.delete("/authorized-users/{email}")
def remove_authorized(
    email: str, db: Session = Depends(get_session), _user: CurrentUser = Depends(require_restricted)
) -> dict:
    row = db.query(AuthorizedUser).filter(AuthorizedUser.email == email.lower()).first()
    if row is None:
        raise HTTPException(404, "Usuario nao encontrado na lista de autorizados")
    db.delete(row)
    db.commit()
    return {"ok": True}
