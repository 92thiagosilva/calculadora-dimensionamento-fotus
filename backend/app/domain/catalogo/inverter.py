"""Entidade canonica Inverter — inversor fotovoltaico catalogado.

Portado 1:1 de fotus-dimens (TS) `src/domain/catalogo/inverter.ts`.

Notas herdadas do projeto de origem (validas para o catalogo Fotus):
- `mppt_currents` pode ter comprimento diferente de `num_mppt`; acesso
  por indice deve ser validado (levanta MPPT_INDEX_OUT_OF_RANGE).
- `lin_max` e um array com zeros de padding; usar `lin_max[i] or 99`.
- `p_max_cc` e `v_max` podem ser None; calculo que dependa deles deve
  levantar CALCULATION_NUMERIC_ERROR.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional

InverterCategory = Literal["On-Grid", "Off-Grid", "Híbrido", "Microinversor"]
InverterPhase = Literal["Monofásico", "Bifásico", "Trifásico"]


@dataclass(frozen=True)
class MpptCurrents:
    imax: float
    isc: float


@dataclass(frozen=True)
class Inverter:
    inverter_id: int
    brand: str
    model: str
    categoria: Optional[InverterCategory]
    p_nom: float
    p_max_cc: Optional[float]
    v_max: Optional[float]
    v_mpp_min: Optional[float]
    v_mpp_max: Optional[float]
    num_mppt: int
    num_inputs: int
    mppt_currents: List[MpptCurrents]
    lin_max: List[float]
    tensao: Optional[float]
    fase: Optional[InverterPhase]
    protection: Optional[str]
