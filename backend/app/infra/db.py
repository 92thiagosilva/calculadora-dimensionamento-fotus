"""Engine/Session SQLAlchemy — SQLite local (hospedagem na maquina do
usuario, sem servico de banco separado)."""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, text
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


def run_lightweight_migrations() -> None:
    """`Base.metadata.create_all` so cria tabelas que ainda nao existem —
    nao adiciona colunas novas a tabelas ja existentes no banco de um
    usuario que ja rodou o app antes. Sem Alembic configurado, cobrimos
    esse caso manualmente: para cada (tabela, coluna, tipo) abaixo, cria
    a coluna via ALTER TABLE se ela ainda nao existir."""
    columns_to_ensure = [
        ("calc_settings_global", "dc_ac_ratio_min_pct_override", "FLOAT"),
        ("calc_settings_inverter_override", "dc_ac_ratio_min_pct_override", "FLOAT"),
    ]
    with engine.connect() as conn:
        for table, column, sql_type in columns_to_ensure:
            existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
            if existing and column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
                conn.commit()
