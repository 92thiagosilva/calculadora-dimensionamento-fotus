from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ModuleOut(BaseModel):
    module_id: int
    brand: str
    model: str
    label: str
    pnom: float
    isc: float
    voc: float
    imp: float
    vmp: float
    coef_v: float
    coef_i: float
    coef_pmp: float
    efic: Optional[float]
    altura_mm: float
    largura_mm: float
    espessura_mm: float
    peso_kg: float


class ModuleIn(BaseModel):
    brand: str
    model: str
    pnom: float
    isc: float
    voc: float
    imp: float
    vmp: float
    coef_v: float
    coef_i: float
    coef_pmp: float
    efic: Optional[float] = None
    altura_mm: float
    largura_mm: float
    espessura_mm: float
    peso_kg: float


class MpptCurrentsIO(BaseModel):
    imax: float
    isc: float


class InverterOut(BaseModel):
    inverter_id: int
    brand: str
    model: str
    categoria: Optional[str]
    p_nom: float
    p_max_cc: Optional[float]
    v_max: Optional[float]
    v_mpp_min: Optional[float]
    v_mpp_max: Optional[float]
    num_mppt: int
    num_inputs: Optional[int]
    mppt_currents: List[MpptCurrentsIO]
    lin_max: List[float]
    tensao: Optional[float]
    fase: Optional[str]
    protection: Optional[str]


class InverterIn(BaseModel):
    brand: str
    model: str
    categoria: Optional[str] = None
    p_nom: float
    p_max_cc: Optional[float] = None
    v_max: Optional[float] = None
    v_mpp_min: Optional[float] = None
    v_mpp_max: Optional[float] = None
    num_mppt: int
    num_inputs: Optional[int] = None
    mppt_currents: List[MpptCurrentsIO]
    lin_max: List[float]
    tensao: Optional[float] = None
    fase: Optional[str] = None
    protection: Optional[str] = None


class ThermalRegionOut(BaseModel):
    region_id: str
    label: str
    t_min: float
    t_max: float
    is_default: bool


# ---- Dimensionamento ----


class CorrectModuleSpecsRequest(BaseModel):
    module_id: int
    t_min: float
    t_max: float


class MpptConfigEntryIO(BaseModel):
    series: int
    strings: int


class ValidateKitRequest(BaseModel):
    inverter_id: int
    module_id: int
    t_min: float
    t_max: float
    mppt_config: List[Optional[MpptConfigEntryIO]]


class AutoConfigRequest(BaseModel):
    inverter_id: int
    module_id: int
    t_min: float
    t_max: float


class SuggestKitRequest(BaseModel):
    target_kwp: Optional[float] = None
    target_inverter_kw: Optional[float] = None
    t_min: float
    t_max: float
    module_brand: Optional[str] = None
    inverter_brand: Optional[str] = None
    inverter_phase: Optional[str] = None
    inverter_min_kw: Optional[float] = None
    inverter_max_kw: Optional[float] = None
    max_suggestions: Optional[int] = None


# ---- Comparativo de Area ----


class AreaCompareRequest(BaseModel):
    module_ids: List[int]
    target_kwp: Optional[float] = None
    area_util_m2: Optional[float] = None


# ---- Mismatch ----


class MismatchRequest(BaseModel):
    original_module_id: int
    substituto_module_id: int


# ---- Auth ----


class MeOut(BaseModel):
    email: str
    name: str
    role: Literal["comercial", "restrito"]


# ---- Ajustes de calculo (global + por inversor) ----


class CalcSettingsIn(BaseModel):
    """Corpo de PUT tanto para o global quanto para override por
    inversor. Campos omitidos = nao alterar; campos enviados como
    null = limpar (voltar a herdar do global, no caso do override)."""

    overload_pct_override: Optional[float] = Field(default=None, ge=0, le=100)
    imax_tolerance_a: Optional[float] = Field(default=None, ge=0, le=10)
    isc_tolerance_a: Optional[float] = Field(default=None, ge=0, le=10)
    vmax_delta_v: Optional[float] = Field(default=None, ge=-500, le=500)
    vmpp_min_delta_v: Optional[float] = Field(default=None, ge=-500, le=500)
    vmpp_max_delta_v: Optional[float] = Field(default=None, ge=-500, le=500)
    dc_ac_ratio_min_pct_override: Optional[float] = Field(default=None, ge=0, le=100)


class CalcSettingsGlobalOut(BaseModel):
    overload_pct_override: Optional[float]
    imax_tolerance_a: float
    isc_tolerance_a: float
    vmax_delta_v: float
    vmpp_min_delta_v: float
    vmpp_max_delta_v: float
    dc_ac_ratio_min_pct_override: Optional[float]
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class InverterOverrideOut(BaseModel):
    inverter_id: int
    overload_pct_override: Optional[float]
    imax_tolerance_a: Optional[float]
    isc_tolerance_a: Optional[float]
    vmax_delta_v: Optional[float]
    vmpp_min_delta_v: Optional[float]
    vmpp_max_delta_v: Optional[float]
    dc_ac_ratio_min_pct_override: Optional[float]
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class InverterCalcSettingsRow(BaseModel):
    inverter_id: int
    brand: str
    model: str
    p_nom: float
    p_max_cc: Optional[float]
    v_max: Optional[float]
    v_mpp_min: Optional[float]
    v_mpp_max: Optional[float]
    num_mppt: int
    mppt_currents: List[MpptCurrentsIO]
    override: Optional[InverterOverrideOut]
