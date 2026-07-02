"""`validate_kit` — BIT-EXATO do bloco de validacao de `renderResult()`
do HTML canonico (linhas 1306-1367), portado de fotus-dimens (TS)
`validate-kit.ts`.

Ver docstrings originais no projeto TS para o raciocinio completo por
tras de cada decisao (dec-046, dec-061, dec-063) — resumo:

- totals sao calculados ANTES do loop por MPPT (mesma ordem do HTML).
- ratioCcCa usa toFixed(0) (nao toFixed(1) como a UI mostra em outro
  lugar) — fixtures golden confirmam.
- vmpArranjo usa vmp CORRIGIDO por temperatura (lim.vmp_min), nao o
  vmp de STC do modulo.
- Quando uma MPPT declarada em num_mppt nao tem `mppt_currents`
  correspondente (catalogo com 24 inversores assim) OU nao recebeu
  configuracao (`cfg[i]` None), o kit fica incompleto:
  allMpptOk=False -> badge "Verificar" (nao "Aprovado" silencioso).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Literal, Optional

from app.domain.calculo_solar.mppt_limits import (
    InverterForMpptLimits,
    ModuleForMpptLimits,
    MpptLimits,
    calculate_mppt_limits,
)
from app.domain.errors import ToolError

OverallBadge = Literal["Aprovado", "Reprovado", "Verificar"]


class InverterForValidate(InverterForMpptLimits):
    p_nom: float
    p_max_cc: Optional[float]


@dataclass(frozen=True)
class MpptConfigInput:
    series: int
    strings: int


@dataclass(frozen=True)
class PerMpptResult:
    mppt_idx: int
    series: int
    strings: int
    limits: MpptLimits
    series_ok: bool
    strings_ok: bool
    badge: Literal["OK", "Verificar"]
    voc_arranjo: float
    vmp_arranjo: float
    imp_arranjo: float


@dataclass(frozen=True)
class ValidateKitOutput:
    per_mppt: List[PerMpptResult]
    total_mods: int
    total_kwp: float
    ratio_cc_ca: float
    overload_kw: float
    overload_fail: bool
    all_mppt_ok: bool
    overall_badge: OverallBadge
    wiring_note: Optional[str]


def _js_to_fixed0(x: float) -> float:
    """Replica `Number.toFixed(0)` do JS (round-half-away-from-zero),
    diferente do round() nativo do Python (round-half-to-even)."""
    return math.floor(x + 0.5) if x >= 0 else math.ceil(x - 0.5)


def validate_kit(
    inv: InverterForValidate,
    mod: ModuleForMpptLimits,
    t_min: float,
    t_max: float,
    cfg: List[Optional[MpptConfigInput]],
) -> ValidateKitOutput:
    if inv.p_max_cc is None:
        raise ToolError(
            "CALCULATION_NUMERIC_ERROR",
            "CALCULATION_NUMERIC_ERROR: inversor sem p_max_cc definido",
        )

    total_mods = 0
    for c in cfg:
        if c:
            total_mods += (c.series or 0) * (c.strings or 0)

    total_kwp = total_mods * mod.pnom / 1000
    overload_kw = inv.p_max_cc / 1000
    overload_fail = total_kwp > overload_kw

    ratio_cc_ca = (
        _js_to_fixed0((total_mods * mod.pnom / inv.p_nom) * 100) if total_mods > 0 else 0
    )

    per_mppt: List[PerMpptResult] = []
    all_mppt_ok = True
    for i in range(inv.num_mppt):
        try:
            lim = calculate_mppt_limits(inv, mod, t_min, t_max, i)
        except ToolError as err:
            if err.code == "MPPT_INDEX_OUT_OF_RANGE":
                all_mppt_ok = False
                continue
            raise

        c = cfg[i] if i < len(cfg) else None
        if not c:
            all_mppt_ok = False
            continue

        series_ok = lim.min_series <= c.series <= lim.max_series
        strings_ok = c.strings <= lim.max_strings
        ok = series_ok and strings_ok
        if not ok:
            all_mppt_ok = False

        voc_arranjo = c.series * lim.voc_max
        vmp_arranjo = c.series * lim.vmp_min
        imp_arranjo = c.strings * lim.imp_max

        per_mppt.append(
            PerMpptResult(
                mppt_idx=i,
                series=c.series,
                strings=c.strings,
                limits=lim,
                series_ok=series_ok,
                strings_ok=strings_ok,
                badge="OK" if ok else "Verificar",
                voc_arranjo=voc_arranjo,
                vmp_arranjo=vmp_arranjo,
                imp_arranjo=imp_arranjo,
            )
        )

    all_ok = all_mppt_ok and not overload_fail
    overall_badge: OverallBadge = (
        "Aprovado" if all_ok else ("Reprovado" if overload_fail else "Verificar")
    )

    wiring_note = (
        f"Overload excedido: {total_kwp:.2f} kWp > {overload_kw:.1f} kWp "
        "(limite CC do inversor). Reduza modulos ou troque o inversor."
        if overload_fail
        else None
    )

    return ValidateKitOutput(
        per_mppt=per_mppt,
        total_mods=total_mods,
        total_kwp=total_kwp,
        ratio_cc_ca=ratio_cc_ca,
        overload_kw=overload_kw,
        overload_fail=overload_fail,
        all_mppt_ok=all_mppt_ok,
        overall_badge=overall_badge,
        wiring_note=wiring_note,
    )
