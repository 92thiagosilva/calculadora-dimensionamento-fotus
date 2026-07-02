"""ThermalRegion — preset termico regional canonico Fotus.

Portado 1:1 de fotus-dimens (TS) `src/domain/catalogo/thermal-region.ts`.
Exatamente 6 regioes, exatamente 1 com is_default=True.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

RegionId = Literal["Conservador", "Sul", "Sudeste", "Centro-Oeste", "Nordeste", "Norte"]


@dataclass(frozen=True)
class ThermalRegion:
    region_id: RegionId
    label: str
    t_min: float
    t_max: float
    is_default: bool


THERMAL_REGIONS: list[ThermalRegion] = [
    ThermalRegion("Conservador", "Conservador", 0, 60, True),
    ThermalRegion("Sul", "Sul", -8, 68, False),
    ThermalRegion("Sudeste", "Sudeste", 0, 70, False),
    ThermalRegion("Centro-Oeste", "Centro-Oeste", 5, 73, False),
    ThermalRegion("Nordeste", "Nordeste", 12, 78, False),
    ThermalRegion("Norte", "Norte", 15, 73, False),
]
