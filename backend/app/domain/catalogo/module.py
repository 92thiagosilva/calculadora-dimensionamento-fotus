"""Entidade canonica Module — modulo fotovoltaico catalogado.

Portado 1:1 de fotus-dimens (TS) `src/domain/catalogo/module.ts`.
Unidades: tensao em V, corrente em A, potencia em Wp, coeficientes
termicos em %/C, dimensoes em mm, peso em kg.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Module:
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
