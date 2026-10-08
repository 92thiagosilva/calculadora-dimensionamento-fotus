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
- `dc_ac_ratio_min_pct_override`: substitui o minimo comercial fixo de
  70% (potencia DC dos modulos / potencia nominal CA do inversor) por
  um valor absoluto (0-100%). Default = usa 70%.

Alem desses parametros fixos, `rules` guarda REGRAS CONDICIONAIS (ver
`conditional_rules.py`): alteracoes no inversor que so valem quando o kit
atende a certas condicoes (ex.: acima de 50% de sobrecarga o V max cai
15%, conforme o fabricante). Ficam por inversor e/ou globais.

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
from app.domain.calculo_solar.commercial_rules import DC_AC_RATIO_MIN_PCT_DEFAULT, DcAcRatioCheck, check_min_dc_ac_ratio
from app.domain.calculo_solar.conditional_rules import (
    AdjustmentRule,
    AppliedRule,
    apply_rules,
    kit_context,
)
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
    dc_ac_ratio_min_pct_override: Optional[float] = None
    rules: Tuple[AdjustmentRule, ...] = ()

    def is_default(self) -> bool:
        return (
            self.overload_pct_override is None
            and self.imax_tolerance_a == 0
            and self.isc_tolerance_a == 0
            and self.vmax_delta_v == 0
            and self.vmpp_min_delta_v == 0
            and self.vmpp_max_delta_v == 0
            and self.dc_ac_ratio_min_pct_override is None
            and not self.rules
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


@dataclass(frozen=True)
class AdjustedValidation:
    result: ValidateKitOutput
    """Resultado final (inversor com ajustes estaticos E regras condicionais)."""
    reasons: List[str]
    """Motivos de ressalva — quando nao vazia, o chamador troca o badge 'Aprovado' por 'Aprovado com ressalva'."""
    applied_rules: List[AppliedRule]
    """Regras condicionais cujas condicoes o kit satisfez."""
    rules_relaxed: bool
    """True se as regras condicionais fizeram algum item passar que nao passaria so com os ajustes estaticos."""


def _total_dc_w(cfg: List[Optional[MpptConfigInput]], mod: ModuleForMpptLimits) -> float:
    return sum((c.series or 0) * (c.strings or 0) for c in cfg if c) * mod.pnom


def _rules_relaxed(before: ValidateKitOutput, after: ValidateKitOutput) -> bool:
    if before.overload_fail and not after.overload_fail:
        return True
    after_by_idx = {p.mppt_idx: p for p in after.per_mppt}
    for b in before.per_mppt:
        a = after_by_idx.get(b.mppt_idx)
        if a is not None and ((a.series_ok and not b.series_ok) or (a.strings_ok and not b.strings_ok)):
            return True
    return False


def validate_kit_with_rules(
    inv: InverterForValidate,
    mod: ModuleForMpptLimits,
    t_min: float,
    t_max: float,
    cfg: List[Optional[MpptConfigInput]],
    adjustments: CalcAdjustments,
) -> AdjustedValidation:
    """Roda `validate_kit` com o inversor ajustado (o resultado real,
    usado para aprovar/reprovar):

    1. ajustes estaticos (tolerancias, deltas de tensao, sobrecarga);
    2. regras condicionais — avaliadas sobre o kit (`cfg`) informado; as
       que se aplicam alteram o inversor antes do calculo final.

    Quando ha algum ajuste configurado, roda TAMBEM com o inversor cru
    (cadastrado) e compara badge a badge — cada diferenca vira um
    motivo de ressalva explicito.
    """
    static_inv = build_adjusted_inverter(inv, adjustments)
    static_result = validate_kit(static_inv, mod, t_min, t_max, cfg)

    ctx = kit_context(_total_dc_w(cfg, mod), inv.p_nom)
    rule_inv, applied_rules = apply_rules(static_inv, adjustments.rules, ctx)
    final_result = validate_kit(rule_inv, mod, t_min, t_max, cfg) if applied_rules else static_result

    if adjustments.is_default():
        return AdjustedValidation(final_result, [], [], False)

    adjusted_inv, adjusted_result = static_inv, static_result
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

    rules_relaxed = bool(applied_rules) and _rules_relaxed(static_result, final_result)
    if rules_relaxed:
        reasons.extend(a.description for a in applied_rules)

    return AdjustedValidation(final_result, reasons, applied_rules, rules_relaxed)


def validate_kit_with_adjustments(
    inv: InverterForValidate,
    mod: ModuleForMpptLimits,
    t_min: float,
    t_max: float,
    cfg: List[Optional[MpptConfigInput]],
    adjustments: CalcAdjustments,
) -> Tuple[ValidateKitOutput, List[str]]:
    """Versao simplificada de `validate_kit_with_rules`: retorna so
    (resultado_final, motivos_de_ressalva)."""
    out = validate_kit_with_rules(inv, mod, t_min, t_max, cfg, adjustments)
    return out.result, out.reasons


def overload_override_note(
    inv: Inverter, adjustments: CalcAdjustments, source: Optional[str] = None
) -> Optional[dict]:
    """Avisa quando um ajuste de Sobrecarga (global ou do inversor) esta
    SUBSTITUINDO a sobrecarga cadastrada no catalogo — ex.: um 0% salvo
    sem querer zera a sobrecarga de todos os inversores e reprova kits
    que o cadastro aceitaria. Retorna None quando nao ha substituicao."""
    override = adjustments.overload_pct_override
    if override is None or inv.p_max_cc is None or inv.p_nom <= 0:
        return None
    catalog_pct = (inv.p_max_cc / inv.p_nom - 1) * 100
    if abs(override - catalog_pct) < 0.05:
        return None
    effective_kw = inv.p_nom * (1 + override / 100) / 1000
    origin = {"global": " (ajuste global)", "inverter": " (ajuste deste inversor)"}.get(source or "", "")
    direction = "reduz" if override < catalog_pct else "amplia"
    where = (
        "em Configurações de Cálculo → \"Ajustar\" deste inversor"
        if source == "inverter"
        else "em Configurações de Cálculo → Padrão global"
    )
    message = (
        f"A sobrecarga cadastrada deste inversor (+{_fmt(catalog_pct)}%, limite de {_fmt(inv.p_max_cc / 1000)} kW) "
        f"está sendo substituída por +{_fmt(override)}% (limite de {_fmt(effective_kw)} kW){origin} em "
        f"Configurações de Cálculo, o que {direction} o limite de sobrecarga. Para voltar a usar a sobrecarga do "
        f"cadastro, {where}, desmarque \"Definir valor customizado\" em Sobrecarga e salve."
    )
    return {
        "override_pct": override,
        "catalog_pct": catalog_pct,
        "catalog_limit_kw": inv.p_max_cc / 1000,
        "effective_limit_kw": effective_kw,
        "source": source,
        "message": message,
    }


def check_dc_ac_ratio_with_adjustments(
    total_kwp: float, p_nom_w: float, adjustments: CalcAdjustments
) -> Tuple[DcAcRatioCheck, float, Optional[str]]:
    """Igual a `commercial_rules.check_min_dc_ac_ratio`, mas usando o
    percentual minimo efetivo (ajuste configurado ou o padrao de 70%).
    Retorna tambem o percentual efetivo usado e, quando o ajuste
    configurado e o motivo de uma aprovacao que NAO aconteceria com o
    padrao de 70%, um motivo de ressalva pronto para exibir."""
    effective_pct = (
        adjustments.dc_ac_ratio_min_pct_override
        if adjustments.dc_ac_ratio_min_pct_override is not None
        else DC_AC_RATIO_MIN_PCT_DEFAULT
    )
    check = check_min_dc_ac_ratio(total_kwp, p_nom_w, effective_pct / 100)

    reason: Optional[str] = None
    if adjustments.dc_ac_ratio_min_pct_override is not None and effective_pct != DC_AC_RATIO_MIN_PCT_DEFAULT:
        default_check = check_min_dc_ac_ratio(total_kwp, p_nom_w, DC_AC_RATIO_MIN_PCT_DEFAULT / 100)
        if check.ok and not default_check.ok:
            reason = (
                f"Mínimo de potência CC/CA ajustado: com o padrão de {_fmt(DC_AC_RATIO_MIN_PCT_DEFAULT)}% "
                f"seriam exigidos no mínimo {_fmt(default_check.min_kwp_required)} kWp de módulos (o kit "
                f"ficaria abaixo); com o ajuste configurado ({_fmt(effective_pct)}%), o mínimo passa a ser "
                f"{_fmt(check.min_kwp_required)} kWp."
            )

    return check, effective_pct, reason
