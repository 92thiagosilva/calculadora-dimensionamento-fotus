"""Comparativo de Area — logica NOVA (nao existia no motor fotus-dimens),
portada diretamente da aba "Comparativo Área" da planilha Fotus
(`2026 - Dimensionamento Módulo x Inversor`).

Formulas fonte (por modulo, colunas M..Z da planilha):
    area_m2       = altura_mm * largura_mm / 1_000_000
    w_por_m2       = pnom / area_m2

Dado um alvo de potencia (target_kwp):
    quantidade_kwp = ROUND(target_kwp*1000 / pnom, 0)      -> round-half-away-from-zero
    kwp_atingido   = quantidade_kwp * pnom / 1000
    area_ocupada   = quantidade_kwp * area_m2

Dado uma area util de telhado disponivel (area_util_m2):
    quantidade_area = ROUNDDOWN(area_util_m2 / area_m2, 0)  -> floor
    kwp_atingido_area = quantidade_area * pnom / 1000
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Optional, Protocol


def _js_round(x: float) -> int:
    return math.floor(x + 0.5) if x >= 0 else math.ceil(x - 0.5)


class ModuleForArea(Protocol):
    module_id: int
    brand: str
    model: str
    label: str
    pnom: float
    efic: Optional[float]
    altura_mm: float
    largura_mm: float
    peso_kg: float


@dataclass(frozen=True)
class AreaComparisonResult:
    module_id: int
    label: str
    pnom: float
    efic: Optional[float]
    area_m2: float
    w_por_m2: float
    peso_kg: float
    quantidade_kwp: Optional[int]
    kwp_atingido: Optional[float]
    area_ocupada_m2: Optional[float]
    quantidade_area: Optional[int]
    kwp_atingido_area: Optional[float]


def compare_modules_area(
    modules: List[ModuleForArea],
    target_kwp: Optional[float] = None,
    area_util_m2: Optional[float] = None,
) -> List[AreaComparisonResult]:
    results: List[AreaComparisonResult] = []
    for mod in modules:
        area_m2 = mod.altura_mm * mod.largura_mm / 1_000_000
        w_por_m2 = mod.pnom / area_m2 if area_m2 else 0.0

        quantidade_kwp: Optional[int] = None
        kwp_atingido: Optional[float] = None
        area_ocupada_m2: Optional[float] = None
        if target_kwp is not None:
            quantidade_kwp = _js_round((target_kwp * 1000) / mod.pnom)
            kwp_atingido = quantidade_kwp * mod.pnom / 1000
            area_ocupada_m2 = quantidade_kwp * area_m2

        quantidade_area: Optional[int] = None
        kwp_atingido_area: Optional[float] = None
        if area_util_m2 is not None:
            quantidade_area = math.floor(area_util_m2 / area_m2) if area_m2 else 0
            kwp_atingido_area = quantidade_area * mod.pnom / 1000

        results.append(
            AreaComparisonResult(
                module_id=mod.module_id,
                label=mod.label,
                pnom=mod.pnom,
                efic=mod.efic,
                area_m2=area_m2,
                w_por_m2=w_por_m2,
                peso_kg=mod.peso_kg,
                quantidade_kwp=quantidade_kwp,
                kwp_atingido=kwp_atingido,
                area_ocupada_m2=area_ocupada_m2,
                quantidade_area=quantidade_area,
                kwp_atingido_area=kwp_atingido_area,
            )
        )
    return results
