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
from typing import List, Optional, Sequence

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


@dataclass(frozen=True)
class MpptDataGaps:
    """MPPTs que o kit USA mas cujo cadastro de corrente do inversor esta incompleto."""

    sem_dados: List[int]
    """Indices (0-based) configurados que nao tem NENHUMA linha de corrente no cadastro (o motor
    nao consegue calcular os limites deles). O kit nao pode ser aprovado."""
    corrente_zerada: List[int]
    """Indices (0-based) configurados cuja corrente cadastrada (I max e/ou Isc) esta vazia ou zero:
    o motor ignora esse limite (assume 99 strings). O kit pode ser aprovado, mas com ressalva."""


def find_mppt_data_gaps(inv, cfg: Sequence) -> MpptDataGaps:
    """Camada de negocio (fora do motor canonico). O motor omite do detalhamento um MPPT sem
    dados e `recompute_badge_from_per_mppt` recalcula o veredito so com os MPPTs do detalhamento;
    sem esta checagem o kit sairia 'Aprovado' sem avisar. MPPTs NAO configurados (None) nao contam:
    nao usar um MPPT e' uma escolha valida."""
    sem_dados: List[int] = []
    corrente_zerada: List[int] = []
    for i, c in enumerate(cfg):
        if c is None or i >= inv.num_mppt:
            continue
        if i >= len(inv.mppt_currents):
            sem_dados.append(i)
            continue
        cur = inv.mppt_currents[i]
        if cur.imax <= 0 or cur.isc <= 0:
            corrente_zerada.append(i)
    return MpptDataGaps(sem_dados=sem_dados, corrente_zerada=corrente_zerada)


def _mppt_label(indexes: Sequence[int]) -> str:
    nums = [i + 1 for i in indexes]
    return f"MPPT {nums[0]}" if len(nums) == 1 else "MPPTs " + ", ".join(str(n) for n in nums)


def mppt_sem_dados_note(indexes: Sequence[int]) -> Optional[str]:
    if not indexes:
        return None
    return (
        f"Não foi possível verificar {_mppt_label(indexes)}: o cadastro deste inversor não traz a corrente "
        "(I max e Isc) do(s) MPPT(s) configurado(s). Complete o cadastro ou deixe de usar o(s) MPPT(s) "
        "para o kit poder ser aprovado."
    )


def mppt_corrente_zerada_reasons(inv, indexes: Sequence[int]) -> List[str]:
    reasons: List[str] = []
    for i in indexes:
        raw = inv.lin_max[i] if i < len(inv.lin_max) else 0
        limite = f"{int(raw)} entrada(s) do MPPT" if raw else "sem limite de entradas informado"
        reasons.append(
            f"MPPT {i + 1}: o cadastro não traz a corrente (I max e/ou Isc); o limite de corrente foi ignorado "
            f"(assumido 99 strings) e as strings ficam limitadas só por {limite}."
        )
    return reasons


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
