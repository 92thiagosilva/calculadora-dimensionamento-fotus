"""Ajustes de calculo configuraveis pelo time restrito (engenharia/
produto) — NAO fazem parte da calculadora canonica nem do motor
bit-exato portado em `validate_kit.py`/`mppt_limits.py`. Substituem a
antiga regra fixa de "+2A de tolerancia no Imax" por um sistema geral
e configuravel, aplicavel globalmente ou por inversor especifico.

Seis parametros ajustaveis, todos com "Default" = usa o valor
cadastrado no catalogo (sem ajuste algum):

- `overload_pct_override`: substitui a sobrecarga cadastrada
  (Pot. Max CC / Pot. Nom. CA - 1) por um valor absoluto (0-100%).
- `imax_tolerance_a` / `isc_tolerance_a`: somados ao I max / Isc max de
  cada MPPT (0 a +10A, em passos de 0,5A). `imax_tolerance_a` comeca
  com default global 2.0 para preservar o comportamento da regra
  anterior.
- `vmax_delta_v` / `vmpp_min_delta_v` / `vmpp_max_delta_v`: somados
  (podem ser negativos) ao V max / V MPP min / V MPP max cadastrados
  (-500 a +500V).

Sempre que um ajuste (diferente do default) for o motivo de uma
aprovacao que NAO teria acontecido com os valores cadastrados, o kit
fica "Aprovado com ressalva" e o motivo especifico e' explicado —
nunca aprovamos silenciosamente algo fora do cadastro sem avisar.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import List, Optional, Tuple

from app.domain.catalogo.inverter import Inverter, MpptCurrents
from app.domain.calculo_solar.validate_kit import (
    InverterForValidate,
    MpptConfigInput,
    ModuleForMpptLimits,
    ValidateKitOutput,
    validate_kit,
)

IMAX_TOLERANCE_DEFAULT_A = 2.0


@dataclass(frozen=True)
class CalcAdjustments:
    overload_pct_override: Optional[float] = None
    imax_tolerance_a: float = 0.0
    isc_tolerance_a: float = 0.0
    vmax_delta_v: float = 0.0
    vmpp_min_delta_v: float = 0.0
    vmpp_max_delta_v: float = 0.0

    def is_default(self) -> bool:
        return (
            self.overload_pct_override is None
            and self.imax_tolerance_a == 0
            and self.isc_tolerance_a == 0
            and self.vmax_delta_v == 0
            and self.vmpp_min_delta_v == 0
            and self.vmpp_max_delta_v == 0
        )


def build_adjusted_inverter(inv: Inverter, adj: CalcAdjustments) -> Inverter:
    """Retorna uma copia de `inv` com os ajustes aplicados. Nao modifica
    `inv` (dataclass congelado) nem o catalogo — apenas o objeto usado
    nesta chamada de calculo."""
    new_currents = [
        MpptCurrents(imax=c.imax + adj.imax_tolerance_a, isc=c.isc + adj.isc_tolerance_a)
        for c in inv.mppt_currents
    ]
    new_v_max = inv.v_max + adj.vmax_delta_v if inv.v_max is not None else None
    new_v_mpp_min = inv.v_mpp_min + adj.vmpp_min_delta_v if inv.v_mpp_min is not None else None
    new_v_mpp_max = inv.v_mpp_max + adj.vmpp_max_delta_v if inv.v_mpp_max is not None else None
    new_p_max_cc = (
        inv.p_nom * (1 + adj.overload_pct_override / 100)
        if adj.overload_pct_override is not None
        else inv.p_max_cc
    )
    return dataclasses.replace(
        inv,
        mppt_currents=new_currents,
        v_max=new_v_max,
        v_mpp_min=new_v_mpp_min,
        v_mpp_max=new_v_mpp_max,
        p_max_cc=new_p_max_cc,
    )


def _fmt(n: float) -> str:
    return f"{n:.1f}"


def validate_kit_with_adjustments(
    inv: InverterForValidate,
    mod: ModuleForMpptLimits,
    t_min: float,
    t_max: float,
    cfg: List[Optional[MpptConfigInput]],
    adjustments: CalcAdjustments,
) -> Tuple[ValidateKitOutput, List[str]]:
    """Roda `validate_kit` com o inversor ajustado (o resultado real,
    usado para aprovar/reprovar). Quando ha algum ajuste configurado,
    roda TAMBEM com o inversor cru (cadastrado) e compara badge a
    badge — cada diferenca vira um motivo de ressalva explicito.

    Retorna (resultado_final, lista_de_motivos_de_ressalva). Quando a
    lista nao esta vazia, o chamador deve trocar `overall_badge` do
    resultado para "Aprovado com ressalva".
    """
    adjusted_inv = build_adjusted_inverter(inv, adjustments)
    adjusted_result = validate_kit(adjusted_inv, mod, t_min, t_max, cfg)

    if adjustments.is_default():
        return adjusted_result, []

    raw_result = validate_kit(inv, mod, t_min, t_max, cfg)
    reasons: List[str] = []

    if (not adjusted_result.overload_fail) and raw_result.overload_fail:
        reasons.append(
            f"Sobrecarga ajustada: com a sobrecarga cadastrada o limite seria "
            f"{_fmt(raw_result.overload_kw)} kW (o kit excederia); com o ajuste configurado, "
            f"o limite passa a ser {_fmt(adjusted_result.overload_kw)} kW."
        )

    raw_by_idx = {p.mppt_idx: p for p in raw_result.per_mppt}
    for adj_p in adjusted_result.per_mppt:
        raw_p = raw_by_idx.get(adj_p.mppt_idx)
        if raw_p is None:
            continue

        if adj_p.series_ok and not raw_p.series_ok:
            voltage_notes = []
            if adjustments.vmax_delta_v != 0 and inv.v_max is not None:
                voltage_notes.append(
                    f"V max {_fmt(inv.v_max)} V → {_fmt(adjusted_inv.v_max)} V"  # type: ignore[arg-type]
                )
            if adjustments.vmpp_min_delta_v != 0 and inv.v_mpp_min is not None:
                voltage_notes.append(
                    f"V MPP min {_fmt(inv.v_mpp_min)} V → {_fmt(adjusted_inv.v_mpp_min)} V"  # type: ignore[arg-type]
                )
            if adjustments.vmpp_max_delta_v != 0 and inv.v_mpp_max is not None:
                voltage_notes.append(
                    f"V MPP max {_fmt(inv.v_mpp_max)} V → {_fmt(adjusted_inv.v_mpp_max)} V"  # type: ignore[arg-type]
                )
            if voltage_notes:
                reasons.append(
                    f"MPPT {adj_p.mppt_idx + 1}: a série de {adj_p.series} módulos só fica dentro da "
                    f"faixa permitida com o(s) ajuste(s) de tensão configurado(s): {', '.join(voltage_notes)}."
                )

        if adj_p.strings_ok and not raw_p.strings_ok:
            current_notes = []
            if adjustments.imax_tolerance_a != 0:
                raw_imax = inv.mppt_currents[adj_p.mppt_idx].imax
                adj_imax = adjusted_inv.mppt_currents[adj_p.mppt_idx].imax
                current_notes.append(f"I max {_fmt(raw_imax)} A → {_fmt(adj_imax)} A")
            if adjustments.isc_tolerance_a != 0:
                raw_isc = inv.mppt_currents[adj_p.mppt_idx].isc
                adj_isc = adjusted_inv.mppt_currents[adj_p.mppt_idx].isc
                current_notes.append(f"Isc max {_fmt(raw_isc)} A → {_fmt(adj_isc)} A")
            if current_notes:
                reasons.append(
                    f"MPPT {adj_p.mppt_idx + 1}: {adj_p.strings} fileira(s) só ficam dentro do limite "
                    f"com a tolerância de corrente configurada: {', '.join(current_notes)}."
                )

    return adjusted_result, reasons
