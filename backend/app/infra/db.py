"""Engine/Session SQLAlchemy — SQLite local (hospedagem na maquina do
usuario, sem servico de banco separado)."""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = os.environ.get("FOTUS_DB_PATH", str(DATA_DIR / "fotus.db"))

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_session() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
