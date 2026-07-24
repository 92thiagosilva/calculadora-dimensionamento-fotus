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


class CalcSettingsGlobal(Base):
    """Ajustes/tolerancias de calculo aplicados por padrao a TODOS os
    inversores, salvo quando um inversor tem override proprio (ver
    `CalcSettingsInverterOverride`). Linha unica (id=1).

    - `overload_pct_override`: substitui a sobrecarga (Pot. Max CC / Pot.
      Nom. CA - 1) cadastrada no catalogo. None = usa o valor cadastrado.
    - `imax_tolerance_a` / `isc_tolerance_a`: somados ao I max / Isc max
      de cada MPPT do inversor (0 a +10A). Default de imax=2.0 preserva
      o comportamento da regra anterior (tolerancia fixa de +2A).
    - `vmax_delta_v` / `vmpp_min_delta_v` / `vmpp_max_delta_v`: somados
      (podem ser negativos) ao V max / V MPP min / V MPP max cadastrados
      (-500 a +500V).
    - `dc_ac_ratio_min_pct_override`: substitui o minimo comercial de
      potencia DC dos modulos em relacao a potencia nominal CA do
      inversor (padrao fixo de 70%) por um valor absoluto (0-100%). None
      = usa o padrao de 70%.
    """

    __tablename__ = "calc_settings_global"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    overload_pct_override: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    imax_tolerance_a: Mapped[float] = mapped_column(Float, default=2.0)
    isc_tolerance_a: Mapped[float] = mapped_column(Float, default=0.0)
    vmax_delta_v: Mapped[float] = mapped_column(Float, default=0.0)
    vmpp_min_delta_v: Mapped[float] = mapped_column(Float, default=0.0)
    vmpp_max_delta_v: Mapped[float] = mapped_column(Float, default=0.0)
    dc_ac_ratio_min_pct_override: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
    updated_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class CalcSettingsInverterOverride(Base):
    """Override por inversor especifico — mesmos campos do global, mas
    todos nullable: None significa 'usar o valor global' para aquele
    campo (nao precisa sobrescrever tudo de uma vez)."""

    __tablename__ = "calc_settings_inverter_override"

    inverter_id: Mapped[int] = mapped_column(Integer, ForeignKey("inverters.inverter_id"), primary_key=True)
    overload_pct_override: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    imax_tolerance_a: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    isc_tolerance_a: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vmax_delta_v: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vmpp_min_delta_v: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vmpp_max_delta_v: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dc_ac_ratio_min_pct_override: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
    updated_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
