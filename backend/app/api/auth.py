"""Autenticacao — login corporativo Microsoft 365 (Azure AD / Entra ID).

MODO ATUAL (desenvolvimento): como o App Registration no Entra ID da
Fotus ainda nao foi criado/configurado, este modulo roda em "dev mode":
aceita um header `X-Dev-User-Email` como identidade confiavel, SEM
validar assinatura nenhuma. Isso e valido apenas com
`FOTUS_AUTH_MODE=dev` (default quando AZURE_TENANT_ID/AZURE_CLIENT_ID
nao estao configurados) e NUNCA deve ser habilitado em producao.

MODO PRODUCAO (a ativar quando as credenciais do Entra ID existirem):
definir as variaveis de ambiente:
  - AZURE_TENANT_ID
  - AZURE_CLIENT_ID
com essas variaveis presentes, o backend passa a validar o JWT
`access_token` emitido pelo Microsoft identity platform (via JWKS
publico do tenant) em vez de confiar no header de dev.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.infra.db import get_session
from app.infra.models import AuthorizedUser

AZURE_TENANT_ID = os.environ.get("AZURE_TENANT_ID")
AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID")
AUTH_MODE = "production" if (AZURE_TENANT_ID and AZURE_CLIENT_ID) else "dev"


@dataclass(frozen=True)
class CurrentUser:
    email: str
    name: str
    role: str  # "comercial" | "restrito"


def _resolve_role(db: Session, email: str) -> str:
    row = db.query(AuthorizedUser).filter(AuthorizedUser.email == email.lower()).first()
    return row.role if row else "comercial"


def _validate_azure_token(authorization: str) -> dict:
    """Valida o access_token do Microsoft identity platform via JWKS do tenant."""
    from jose import jwt as jose_jwt
    import httpx

    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Token ausente ou mal formatado")
    token = authorization.removeprefix("Bearer ")

    jwks_url = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/discovery/v2.0/keys"
    jwks = httpx.get(jwks_url, timeout=5.0).json()
    unverified_header = jose_jwt.get_unverified_header(token)
    key = next((k for k in jwks["keys"] if k["kid"] == unverified_header["kid"]), None)
    if key is None:
        raise HTTPException(401, "Chave de assinatura do token nao encontrada")

    try:
        claims = jose_jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=AZURE_CLIENT_ID,
            issuer=f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/v2.0",
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(401, f"Token invalido: {exc}") from exc
    return claims


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_dev_user_email: Optional[str] = Header(default=None),
    db: Session = Depends(get_session),
) -> CurrentUser:
    if AUTH_MODE == "production":
        if not authorization:
            raise HTTPException(401, "Login necessario")
        claims = _validate_azure_token(authorization)
        email = (claims.get("preferred_username") or claims.get("email") or "").lower()
        name = claims.get("name", email)
        if not email:
            raise HTTPException(401, "Token sem e-mail associado")
        return CurrentUser(email=email, name=name, role=_resolve_role(db, email))

    # Dev mode: confia no header sem validar assinatura.
    if not x_dev_user_email:
        raise HTTPException(
            401,
            "Modo dev: envie o header X-Dev-User-Email para simular login "
            "(SSO Microsoft 365 ainda nao configurado — ver AZURE_TENANT_ID/AZURE_CLIENT_ID).",
        )
    email = x_dev_user_email.lower()
    return CurrentUser(email=email, name=email, role=_resolve_role(db, email))


def require_restricted(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "restrito":
        raise HTTPException(403, "Acesso restrito a usuarios autorizados (Mismatch/BD).")
    return user
