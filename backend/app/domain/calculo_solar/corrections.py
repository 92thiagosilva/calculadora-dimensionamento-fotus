"""`apply_module_corrections` — correcao termica de modulo FV.

Portado BIT-EXATO de fotus-dimens (TS) `apply-corrections.ts`, que por
sua vez espelha `calcModuleCorrections` do HTML canonico Fotus
(linhas 832-838). NAO reescrever as formulas em forma matematicamente
equivalente — ponto flutuante IEEE754 nao e associativo, e a paridade
bit-a-bit com a planilha/HTML e um requisito de negocio (dec-033 do
projeto de origem).

Formulas:
    voc_max = voc * (1 + (t_min - 25) * coef_v   / 100)
    vmp_min = vmp * (1 + (t_max - 25) * coef_pmp / 100)
    imp_max = imp * (1 + (t_max - 25) * coef_i   / 100)
    isc_max = isc * (1 + (t_max - 25) * coef_i   / 100)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class ModuleForCorrections(Protocol):
    voc: float
    vmp: float
    imp: float
    isc: float
    coef_v: float
    coef_pmp: float
    coef_i: float


@dataclass(frozen=True)
class ModuleCorrections:
    voc_max: float
    vmp_min: float
    imp_max: float
    isc_max: float


def apply_module_corrections(
    mod: ModuleForCorrections, t_min: float, t_max: float
) -> ModuleCorrections:
    voc_max = mod.voc * (1 + (t_min - 25) * mod.coef_v / 100)
    vmp_min = mod.vmp * (1 + (t_max - 25) * mod.coef_pmp / 100)
    imp_max = mod.imp * (1 + (t_max - 25) * mod.coef_i / 100)
    isc_max = mod.isc * (1 + (t_max - 25) * mod.coef_i / 100)
    return ModuleCorrections(voc_max=voc_max, vmp_min=vmp_min, imp_max=imp_max, isc_max=isc_max)
