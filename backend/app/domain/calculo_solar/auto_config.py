"""`auto_config_strings` — BIT-EXATO de `autoConfigStrings` do HTML
canonico (linhas 1115-1127), portado de fotus-dimens (TS) `auto-config.ts`.

Para cada MPPT do inversor, sugere series = ponto medio arredondado
entre min_series e max_series (clamped ao intervalo), strings = 1.
MPPTs sem `mppt_currents` correspondente sao pulados (espelha o
`continue` do HTML quando `calcMpptLimits` retorna null).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List

from app.domain.calculo_solar.mppt_limits import (
    InverterForMpptLimits,
    ModuleForMpptLimits,
    calculate_mppt_limits,
)
from app.domain.errors import ToolError


@dataclass(frozen=True)
class MpptConfigEntry:
    series: int
    strings: int


def _js_round(x: float) -> int:
    """Replica Math.round do JS (arredonda .5 para cima)."""
    return math.floor(x + 0.5)


def auto_config_strings(
    inv: InverterForMpptLimits,
    mod: ModuleForMpptLimits,
    t_min: float,
    t_max: float,
) -> List[MpptConfigEntry]:
    mppt_config: List[MpptConfigEntry] = []
    for i in range(inv.num_mppt):
        try:
            lim = calculate_mppt_limits(inv, mod, t_min, t_max, i)
        except ToolError as err:
            if err.code == "MPPT_INDEX_OUT_OF_RANGE":
                continue
            raise
        opt_series = min(
            lim.max_series,
            max(lim.min_series, _js_round((lim.min_series + lim.max_series) / 2)),
        )
        mppt_config.append(MpptConfigEntry(series=opt_series, strings=1))
    return mppt_config
