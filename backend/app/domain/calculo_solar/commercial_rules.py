"""Regras comerciais Fotus adicionais — NÃO fazem parte da calculadora
canônica (HTML/planilha original) nem do motor bit-exato portado em
`validate_kit.py`/`auto_config.py`/etc. São políticas de negócio
aplicadas por cima do resultado técnico, na camada de API, para não
comprometer a fidelidade 1:1 do motor canônico (Princípio 1 herdado do
projeto fotus-dimens).

Regra dos 70% (informada pelo operador Fotus, 2026-07-02): a potência
DC dos módulos escolhidos deve ser, no mínimo, 70% da potência nominal
CA do inversor. Ex.: inversor de 10 kW nominal exige pelo menos 7 kWp
de módulos. Abaixo disso, o kit é considerado subdimensionado e não
deve ser aprovado — nem no fluxo manual (validate-kit) nem nas
sugestões automáticas (suggest-kit). Esse minimo de 70% e o DEFAULT;
e configuravel (0-100%) via `calc_adjustments.py`
(`dc_ac_ratio_min_pct_override`, global ou por inversor).

Ver tambem `calc_adjustments.py` — sistema configuravel de tolerancias
(Imax, Isc, V max, V MPP min/max, sobrecarga, minimo CC/CA) que
substituiu a antiga regra fixa de "+2A no Imax" que existia aqui.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass

from app.domain.calculo_solar.validate_kit import ValidateKitOutput

DC_AC_RATIO_MIN_PCT_DEFAULT = 70.0
MIN_DC_AC_RATIO = DC_AC_RATIO_MIN_PCT_DEFAULT / 100


@dataclass(frozen=True)
class DcAcRatioCheck:
    ratio: float
    """total_kwp / p_nom_kw — nao arredondado (diferente de ratio_cc_ca, que e um valor de exibicao)."""
    min_kwp_required: float
    """min_ratio * p_nom_kw — quantos kWp de modulos sao necessarios no minimo."""
    ok: bool


def check_min_dc_ac_ratio(total_kwp: float, p_nom_w: float, min_ratio: float = MIN_DC_AC_RATIO) -> DcAcRatioCheck:
    """`min_ratio` e uma fracao (0.70 = 70%), nao um percentual — quem
    tem o percentual configurado (0-100) deve dividir por 100 antes de
    chamar (ver `calc_adjustments.check_dc_ac_ratio_with_adjustments`)."""
    p_nom_kw = p_nom_w / 1000
    min_kwp_required = min_ratio * p_nom_kw
    ratio = (total_kwp / p_nom_kw) if p_nom_kw > 0 else 0.0
    return DcAcRatioCheck(ratio=ratio, min_kwp_required=min_kwp_required, ok=total_kwp >= min_kwp_required)


def recompute_badge_from_per_mppt(validation: ValidateKitOutput) -> ValidateKitOutput:
    """O motor canonico (`validate_kit`) trata qualquer MPPT sem
    configuracao como 'kit incompleto' (allMpptOk=False -> badge
    'Verificar'), espelhando o comportamento do HTML original. Na
    pratica Fotus, porem, nao usar um MPPT e uma escolha valida do
    vendedor (ex.: instalacao pequena num inversor de 2 MPPTs usando so
    1). Recalcula `all_mppt_ok`/`overall_badge` considerando apenas os
    MPPTs presentes em `per_mppt` (o motor canonico ja omite dali
    qualquer MPPT nao configurado — dec-063 em validate_kit.py), sem
    tocar na logica bit-exata de `validate_kit`."""
    per_mppt = validation.per_mppt
    if not per_mppt:
        return validation
    all_mppt_ok = all(p.badge == "OK" for p in per_mppt)
    if validation.overload_fail:
        overall_badge = "Reprovado"
    elif all_mppt_ok:
        overall_badge = "Aprovado"
    else:
        overall_badge = "Verificar"
    return dataclasses.replace(validation, all_mppt_ok=all_mppt_ok, overall_badge=overall_badge)  # type: ignore[arg-type]
