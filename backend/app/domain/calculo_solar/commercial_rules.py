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
sugestões automáticas (suggest-kit).

Tolerância de +2A no Imax (informada pelo operador Fotus, 2026-07-02):
quando a corrente do arranjo (Imp corrigido pela temperatura × número
de strings) ultrapassa o "I max [A]" do MPPT do inversor, mas fica
dentro de uma margem de +2A acima desse limite, o kit não é reprovado
— é aprovado com ressalva ("Aprovado com ressalva"), com alerta
explicando o motivo. Essa tolerância NÃO se aplica ao Isc (corrente de
curto-circuito, ligada à proteção do equipamento) nem ao limite físico
de fileiras (`lin_max`) — só ao Imax operacional.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import List, Tuple

from app.domain.calculo_solar.validate_kit import ValidateKitOutput

MIN_DC_AC_RATIO = 0.70
IMAX_TOLERANCE_A = 2.0


@dataclass(frozen=True)
class DcAcRatioCheck:
    ratio: float
    """total_kwp / p_nom_kw — nao arredondado (diferente de ratio_cc_ca, que e um valor de exibicao)."""
    min_kwp_required: float
    """0.70 * p_nom_kw — quantos kWp de modulos sao necessarios no minimo."""
    ok: bool


def check_min_dc_ac_ratio(total_kwp: float, p_nom_w: float) -> DcAcRatioCheck:
    p_nom_kw = p_nom_w / 1000
    min_kwp_required = MIN_DC_AC_RATIO * p_nom_kw
    ratio = (total_kwp / p_nom_kw) if p_nom_kw > 0 else 0.0
    return DcAcRatioCheck(ratio=ratio, min_kwp_required=min_kwp_required, ok=total_kwp >= min_kwp_required)


def apply_imax_tolerance(validation: ValidateKitOutput) -> Tuple[ValidateKitOutput, List[bool]]:
    """Recalcula `strings_ok`/badge/overall_badge de `validation` aplicando
    a tolerancia de +2A no Imax. Retorna a validacao ajustada e uma lista
    paralela a `per_mppt` indicando em quais MPPTs a tolerancia foi usada.

    Nao modifica `validate_kit` (motor canonico bit-exato) — reconstroi
    uma copia do resultado via `dataclasses.replace`.

    Efeito colateral util: como `all_mppt_ok`/`overall_badge` sao
    recalculados a partir apenas dos MPPTs presentes em `per_mppt` (o
    motor canonico ja omite dali qualquer MPPT que o usuario deixou sem
    configuracao — ver dec-063 em validate_kit.py), esta funcao tambem
    resolve corretamente o caso de "MPPT nao utilizado por escolha do
    vendedor" sem precisar de uma regra separada para isso.
    """
    if not validation.per_mppt:
        return validation, []

    new_per_mppt = []
    tolerance_flags: List[bool] = []
    any_tolerance = False

    for p in validation.per_mppt:
        strings_ok = p.strings_ok
        tolerance_applied = False
        if not strings_ok:
            lim = p.limits
            isc_ok = p.strings <= lim.max_strings_by_isc
            lin_ok = p.strings <= lim.lin_max
            over_by_imax = p.imp_arranjo > lim.imax_mppt
            within_tolerance = p.imp_arranjo <= lim.imax_mppt + IMAX_TOLERANCE_A
            if isc_ok and lin_ok and over_by_imax and within_tolerance:
                strings_ok = True
                tolerance_applied = True
                any_tolerance = True
        badge = "OK" if (p.series_ok and strings_ok) else "Verificar"
        new_per_mppt.append(dataclasses.replace(p, strings_ok=strings_ok, badge=badge))
        tolerance_flags.append(tolerance_applied)

    all_mppt_ok = all(p.badge == "OK" for p in new_per_mppt)
    if validation.overload_fail:
        overall_badge = "Reprovado"
    elif all_mppt_ok:
        overall_badge = "Aprovado com ressalva" if any_tolerance else "Aprovado"
    else:
        overall_badge = "Verificar"

    adjusted = dataclasses.replace(
        validation,
        per_mppt=new_per_mppt,
        all_mppt_ok=all_mppt_ok,
        overall_badge=overall_badge,  # type: ignore[arg-type]
    )
    return adjusted, tolerance_flags
