"""Mismatch — logica NOVA (nao existia no motor fotus-dimens), portada
diretamente da aba "Mismatch" da planilha Fotus
(`2026 - Dimensionamento Módulo x Inversor`).

Compara um modulo ORIGINAL (ja usado num projeto) contra um modulo
SUBSTITUTO, para avaliar se a troca e segura sem redimensionar o
projeto. Calcula o delta percentual relativo (ao original) de 8
parametros eletricos, corrige Voc/Vmp/Imp na janela termica
"Conservador" (0..60 C, fixa na planilha — nao configuravel pelo
usuario nesta aba) e aplica tolerancia de 3%.

ATENCAO — fidelidade bit-exata a planilha (celula por celula):
  J12 (delta Voc_max) = |Voc_max_orig - Voc_max_sub| / Voc_max_orig
      onde Voc_max = voc * (1 + (t_min - 25) * coef_v / 100)      [t_min=0]
  J13 (delta Vmp_min) = |Vmp_min_orig - Vmp_min_sub| / Vmp_min_orig
      onde Vmp_min = vmp * (1 + (t_max - 25) * coef_pmp / 100)    [t_max=60]
  J14 (delta Imp_max) = |Imp_max_orig - Imp_max_sub| / Imp_max_orig
      onde Imp_max = imp * (1 + (t_min - 25) * coef_i / 100)      [t_min=0 !]

  A planilha original usa (t_min - 25) tambem para Imp_max (celula
  C14=C7*(1+(0-25)*C11/100)), e NAO (t_max - 25) como a formula
  canonica de Imp_max usada no restante da calculadora (aba
  "Dimensionamento Personalizado" e no motor fotus-dimens). Isso
  parece uma inconsistencia/copy-paste na planilha original (a label
  da celula ate diz "Imp max (Tmax)"), mas por principio de fidelidade
  1:1 reproduzimos o comportamento exato da planilha aqui. Foi
  sinalizado ao operador Fotus para decisao (corrigir na planilha
  fonte ou manter).

Veredito: MATCH se as 3 deltas (Voc_max, Vmp_min, Imp_max) forem
<= 3%; caso contrario MISMATCH.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

MISMATCH_T_MIN = 0
MISMATCH_T_MAX = 60
MISMATCH_TOLERANCE = 0.03


class ModuleForMismatch(Protocol):
    module_id: int
    label: str
    pnom: float
    isc: float
    voc: float
    imp: float
    vmp: float
    coef_v: float
    coef_i: float
    coef_pmp: float


def _rel_delta(orig: float, sub: float) -> float:
    if orig == 0:
        return 0.0
    return abs(orig - sub) / orig


@dataclass(frozen=True)
class MismatchParamDelta:
    label: str
    original: float
    substituto: float
    delta_pct: float


@dataclass(frozen=True)
class MismatchResult:
    original_module_id: int
    substituto_module_id: int
    original_label: str
    substituto_label: str
    params: list[MismatchParamDelta]
    voc_max_original: float
    voc_max_substituto: float
    voc_max_delta_pct: float
    vmp_min_original: float
    vmp_min_substituto: float
    vmp_min_delta_pct: float
    imp_max_original: float
    imp_max_substituto: float
    imp_max_delta_pct: float
    veredito: str  # "MATCH" | "MISMATCH"


def compute_mismatch(original: ModuleForMismatch, substituto: ModuleForMismatch) -> MismatchResult:
    params = [
        MismatchParamDelta("P nom [Wp]", original.pnom, substituto.pnom, _rel_delta(original.pnom, substituto.pnom)),
        MismatchParamDelta("I SC [A]", original.isc, substituto.isc, _rel_delta(original.isc, substituto.isc)),
        MismatchParamDelta("V OC [V]", original.voc, substituto.voc, _rel_delta(original.voc, substituto.voc)),
        MismatchParamDelta("I MP nom [A]", original.imp, substituto.imp, _rel_delta(original.imp, substituto.imp)),
        MismatchParamDelta("V MP nom [V]", original.vmp, substituto.vmp, _rel_delta(original.vmp, substituto.vmp)),
        MismatchParamDelta("Coef Pmp [%/C]", original.coef_pmp, substituto.coef_pmp, _rel_delta(original.coef_pmp, substituto.coef_pmp)),
        MismatchParamDelta("Coef V [%/C]", original.coef_v, substituto.coef_v, _rel_delta(original.coef_v, substituto.coef_v)),
        MismatchParamDelta("Coef I [%/C]", original.coef_i, substituto.coef_i, _rel_delta(original.coef_i, substituto.coef_i)),
    ]

    voc_max_o = original.voc * (1 + (MISMATCH_T_MIN - 25) * original.coef_v / 100)
    voc_max_s = substituto.voc * (1 + (MISMATCH_T_MIN - 25) * substituto.coef_v / 100)
    vmp_min_o = original.vmp * (1 + (MISMATCH_T_MAX - 25) * original.coef_pmp / 100)
    vmp_min_s = substituto.vmp * (1 + (MISMATCH_T_MAX - 25) * substituto.coef_pmp / 100)
    # Fiel a planilha: usa t_min (nao t_max) tambem para Imp_max — ver docstring do modulo.
    imp_max_o = original.imp * (1 + (MISMATCH_T_MIN - 25) * original.coef_i / 100)
    imp_max_s = substituto.imp * (1 + (MISMATCH_T_MIN - 25) * substituto.coef_i / 100)

    voc_max_delta = _rel_delta(voc_max_o, voc_max_s)
    vmp_min_delta = _rel_delta(vmp_min_o, vmp_min_s)
    imp_max_delta = _rel_delta(imp_max_o, imp_max_s)

    veredito = (
        "MATCH"
        if voc_max_delta <= MISMATCH_TOLERANCE
        and vmp_min_delta <= MISMATCH_TOLERANCE
        and imp_max_delta <= MISMATCH_TOLERANCE
        else "MISMATCH"
    )

    return MismatchResult(
        original_module_id=original.module_id,
        substituto_module_id=substituto.module_id,
        original_label=original.label,
        substituto_label=substituto.label,
        params=params,
        voc_max_original=voc_max_o,
        voc_max_substituto=voc_max_s,
        voc_max_delta_pct=voc_max_delta,
        vmp_min_original=vmp_min_o,
        vmp_min_substituto=vmp_min_s,
        vmp_min_delta_pct=vmp_min_delta,
        imp_max_original=imp_max_o,
        imp_max_substituto=imp_max_s,
        imp_max_delta_pct=imp_max_delta,
        veredito=veredito,
    )
