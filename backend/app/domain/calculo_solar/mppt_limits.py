"""`calculate_mppt_limits` — implementacao BIT-EXATA de `calcMpptLimits`
do HTML canonico Fotus (linhas 840-865), portada de fotus-dimens (TS)
`calculate-mppt-limits.ts`.

Regras literais (proibido reordenar/"otimizar" — mudaria o resultado
em casos de empate):
    lin_max            = inv.lin_max[mppt_idx] or 99   (fallback: 0 -> 99)
    max_series_voc     = floor(inv.v_max / voc_max)
    max_series_vmpp    = floor(inv.v_mpp_max / mod.vmp) se v_mpp_max, senao max_series_voc
    min_series         = ceil(inv.v_mpp_min / vmp_min) se v_mpp_min, senao 1
    max_series         = min(max_series_voc, max_series_vmpp)
    max_strings_by_imax = floor(curr.imax / imp_max) se curr.imax > 0, senao 99
    max_strings_by_isc  = floor(curr.isc / isc_max) se curr.isc > 0, senao 99
    max_strings        = min(max_strings_by_imax, max_strings_by_isc, lin_max)
    limiting_factor: ordem linMax -> imax -> isc (nao inverter)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Literal, Optional, Protocol

from app.domain.calculo_solar.corrections import ModuleForCorrections, apply_module_corrections
from app.domain.errors import ToolError

LimitingFactor = Literal["linMax", "imax", "isc"]


@dataclass(frozen=True)
class MpptLimits:
    max_series_voc: int
    max_series_vmpp: int
    min_series: int
    max_series: int
    max_strings: int
    max_strings_by_imax: int
    max_strings_by_isc: int
    lin_max: float
    imax_mppt: float
    isc_mppt: float
    limiting_factor: LimitingFactor
    voc_max: float
    vmp_min: float
    imp_max: float
    isc_max: float


class MpptCurrentLike(Protocol):
    imax: float
    isc: float


class InverterForMpptLimits(Protocol):
    mppt_currents: List[MpptCurrentLike]
    lin_max: List[float]
    v_max: Optional[float]
    v_mpp_min: Optional[float]
    v_mpp_max: Optional[float]
    num_mppt: int


class ModuleForMpptLimits(ModuleForCorrections, Protocol):
    vmp: float


def calculate_mppt_limits(
    inv: InverterForMpptLimits,
    mod: ModuleForMpptLimits,
    t_min: float,
    t_max: float,
    mppt_idx: int,
) -> MpptLimits:
    corr = apply_module_corrections(mod, t_min, t_max)
    voc_max, vmp_min, imp_max, isc_max = (
        corr.voc_max,
        corr.vmp_min,
        corr.imp_max,
        corr.isc_max,
    )

    if mppt_idx < 0 or mppt_idx >= len(inv.mppt_currents):
        raise ToolError(
            "MPPT_INDEX_OUT_OF_RANGE",
            f"MPPT_INDEX_OUT_OF_RANGE: mpptIdx={mppt_idx} fora do range (num_mppt={inv.num_mppt})",
        )
    curr = inv.mppt_currents[mppt_idx]

    if inv.v_max is None:
        raise ToolError(
            "CALCULATION_NUMERIC_ERROR",
            "CALCULATION_NUMERIC_ERROR: inversor sem v_max definido",
        )

    lin_max_raw = inv.lin_max[mppt_idx] if mppt_idx < len(inv.lin_max) else 0
    lin_max = lin_max_raw or 99

    max_series_voc = math.floor(inv.v_max / voc_max)
    max_series_vmpp = math.floor(inv.v_mpp_max / mod.vmp) if inv.v_mpp_max else max_series_voc
    min_series = math.ceil(inv.v_mpp_min / vmp_min) if inv.v_mpp_min else 1
    max_series = min(max_series_voc, max_series_vmpp)

    max_strings_by_imax = math.floor(curr.imax / imp_max) if curr.imax > 0 else 99
    max_strings_by_isc = math.floor(curr.isc / isc_max) if curr.isc > 0 else 99
    max_strings = min(max_strings_by_imax, max_strings_by_isc, lin_max)

    if max_strings == lin_max and max_strings <= max_strings_by_imax and max_strings <= max_strings_by_isc:
        limiting_factor: LimitingFactor = "linMax"
    elif max_strings_by_imax <= max_strings_by_isc:
        limiting_factor = "imax"
    else:
        limiting_factor = "isc"

    return MpptLimits(
        max_series_voc=max_series_voc,
        max_series_vmpp=max_series_vmpp,
        min_series=min_series,
        max_series=max_series,
        max_strings=max_strings,
        max_strings_by_imax=max_strings_by_imax,
        max_strings_by_isc=max_strings_by_isc,
        lin_max=lin_max,
        voc_max=voc_max,
        vmp_min=vmp_min,
        imp_max=imp_max,
        isc_max=isc_max,
        imax_mppt=curr.imax,
        isc_mppt=curr.isc,
        limiting_factor=limiting_factor,
    )
