"""Modelos SQLAlchemy — catalogo (modulos/inversores) e controle de
acesso (usuarios autorizados na area restrita + log de auditoria de
edicoes no BD)."""

from __future__ import annotations

import datetime as dt
from typing import List, Optional

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infra.db import Base


class ModuleRow(Base):
    __tablename__ = "modules"

    module_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand: Mapped[str] = mapped_column(String, index=True)
    model: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String)
    pnom: Mapped[float] = mapped_column(Float)
    isc: Mapped[float] = mapped_column(Float)
    voc: Mapped[float] = mapped_column(Float)
    imp: Mapped[float] = mapped_column(Float)
    vmp: Mapped[float] = mapped_column(Float)
    coef_v: Mapped[float] = mapped_column(Float)
    coef_i: Mapped[float] = mapped_column(Float)
    coef_pmp: Mapped[float] = mapped_column(Float)
    efic: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    altura_mm: Mapped[float] = mapped_column(Float)
    largura_mm: Mapped[float] = mapped_column(Float)
    espessura_mm: Mapped[float] = mapped_column(Float)
    peso_kg: Mapped[float] = mapped_column(Float)


class InverterRow(Base):
    __tablename__ = "inverters"

    inverter_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand: Mapped[str] = mapped_column(String, index=True)
    model: Mapped[str] = mapped_column(String)
    categoria: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    p_nom: Mapped[float] = mapped_column(Float)
    p_max_cc: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    v_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    v_mpp_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    v_mpp_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    num_mppt: Mapped[int] = mapped_column(Integer)
    num_inputs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Lista de {"imax": float, "isc": float}, uma entrada por MPPT (pode ter
    # comprimento != num_mppt — ver nota em app/domain/catalogo/inverter.py).
    mppt_currents: Mapped[List[dict]] = mapped_column(JSON)
    lin_max: Mapped[List[float]] = mapped_column(JSON)
    tensao: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fase: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    protection: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class AuthorizedUser(Base):
    """Allowlist de e-mails com papel elevado ('restrito'). Qualquer
    usuario autenticado via SSO Microsoft 365 que NAO esteja aqui
    recebe o papel padrao 'comercial'."""

    __tablename__ = "authorized_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    role: Mapped[str] = mapped_column(String, default="restrito")
    added_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


class AuditLogEntry(Base):
    """Log de auditoria de edicoes no BD (quem alterou o que)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    user_email: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)  # create | update | delete
    entity_type: Mapped[str] = mapped_column(String)  # module | inverter
    entity_id: Mapped[int] = mapped_column(Integer)
    detail: Mapped[Optional[str]] = mapped_column(String, nullable=True)
