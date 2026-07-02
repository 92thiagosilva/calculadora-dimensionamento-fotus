"""Bootstrap: adiciona o primeiro usuario com papel 'restrito' (necessario
porque o endpoint /api/auth/authorized-users so pode ser chamado por
quem ja e restrito — problema do "primeiro admin").

Uso:
    python -m app.infra.seed_admin seu-email@fotus.com.br
"""

from __future__ import annotations

import sys

from app.infra.db import Base, SessionLocal, engine
from app.infra.models import AuthorizedUser


def seed(email: str) -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        email = email.lower()
        existing = db.query(AuthorizedUser).filter(AuthorizedUser.email == email).first()
        if existing:
            existing.role = "restrito"
            print(f"{email} ja existia — papel atualizado para 'restrito'.")
        else:
            db.add(AuthorizedUser(email=email, role="restrito"))
            print(f"{email} adicionado com papel 'restrito'.")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python -m app.infra.seed_admin <email>")
        sys.exit(1)
    seed(sys.argv[1])
