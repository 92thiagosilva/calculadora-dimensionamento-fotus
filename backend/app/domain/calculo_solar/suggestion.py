"""`suggest_kit` — sugestao de combinacoes modulo+inversor.

Portado de fotus-dimens (TS) `suggestion.ts`. Nao ha algoritmo canonico
no HTML fonte para esta funcao; ela compoe `auto_config_strings` +
`validate_kit` sobre o cartesiano modulos x inversores, excluindo
Microinversor por padrao, e ordena por proximidade ao alvo.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from typing import Dict, List, Optional

from app.domain.calculo_solar.calc_adjustments import (
    CalcAdjustments,
    build_adjusted_inverter,
    check_dc_ac_ratio_with_adjustments,
    validate_kit_with_adjustments,
)
from app.domain.calculo_solar.commercial_rules import recompute_badge_from_per_mppt
from app.domain.calculo_solar.mppt_limits import calculate_mppt_limits
from app.domain.calculo_solar.validate_kit import (
    MpptConfigInput,
    ValidateKitOutput,
)
from app.domain.catalogo.inverter import Inverter, InverterPhase
from app.domain.catalogo.module import Module
from app.domain.errors import ToolError

DEFAULT_LIMIT = 100
LIMIT_MIN = 1
LIMIT_MAX = 500

# Tolerancia de ponto flutuante para "potencia do inversor == meta digitada"
# (0.01 kW = 10W, bem abaixo de qualquer diferenca real entre modelos).
INVERTER_KW_EXACT_TOLERANCE = 0.01


def _candidate_mppt_configs(
    inv: Inverter, mod: Module, t_min: float, t_max: float
) -> List[List[Optional[MpptConfigInput]]]:
    """Gera varias configuracoes candidatas de series/strings por MPPT,
    variando do minimo ate o maximo permitido por `inv` — NAO apenas o
    ponto medio de 1 string que `auto_config_strings` usa como sugestao
    segura para preenchimento manual.

    `inv` aqui ja deve vir com os ajustes de calculo aplicados (ver
    `calc_adjustments.build_adjusted_inverter`) — assim os limites min/
    max ja refletem tolerancias configuradas, sem precisar de um caso
    especial aqui.

    Sem essa variacao, `suggest_kit` so enxergava um unico tamanho de
    kit por combinacao modulo+inversor, o que impedia sugestoes de
    aproveitarem toda a faixa comercial valida da Fotus (70% da
    potencia nominal ate o overload maximo do inversor).
    """
    limits = []
    for i in range(inv.num_mppt):
        try:
            limits.append(calculate_mppt_limits(inv, mod, t_min, t_max, i))
        except ToolError:
            limits.append(None)

    if all(lim is None for lim in limits):
        return []

    seen = set()
    configs: List[List[Optional[MpptConfigInput]]] = []
    for series_choice in ("min", "mid", "max"):
        for strings_choice in ("min", "max"):
            cfg: List[Optional[MpptConfigInput]] = []
            key_parts = []
            for lim in limits:
                if lim is None:
                    cfg.append(None)
                    key_parts.append(None)
                    continue
                if series_choice == "min":
                    series = lim.min_series
                elif series_choice == "max":
                    series = lim.max_series
                else:
                    series = min(
                        lim.max_series,
                        max(lim.min_series, round((lim.min_series + lim.max_series) / 2)),
                    )
                strings = lim.max_strings if strings_choice == "max" else 1
                if strings < 1 or series < 1:
                    cfg = []
                    break
                cfg.append(MpptConfigInput(series=series, strings=strings))
                key_parts.append((series, strings))
            if not cfg:
                continue
            key = tuple(key_parts)
            if key in seen:
                continue
            seen.add(key)
            configs.append(cfg)
    return configs


@dataclass(frozen=True)
class MpptConfigOutputEntry:
    mppt_idx: int
    series: int
    strings: int


@dataclass(frozen=True)
class KitSuggestionOutput:
    module_id: int
    inverter_id: int
    mppt_config: List[MpptConfigOutputEntry]
    validation: ValidateKitOutput
    score: float
    ressalva_reasons: List[str]


def _norm_brand(s: str) -> str:
    return s.strip().upper()


def _clamp_limit(n: Optional[int]) -> int:
    if n is None:
        return DEFAULT_LIMIT
    if n < LIMIT_MIN:
        return LIMIT_MIN
    if n > LIMIT_MAX:
        return LIMIT_MAX
    return int(n)


def suggest_kit(
    modules: List[Module],
    inverters: List[Inverter],
    t_min: float,
    t_max: float,
    target_kwp: Optional[float] = None,
    target_inverter_kw: Optional[float] = None,
    module_brand: Optional[str] = None,
    inverter_brand: Optional[str] = None,
    inverter_phase: Optional[InverterPhase] = None,
    inverter_min_kw: Optional[float] = None,
    inverter_max_kw: Optional[float] = None,
    max_suggestions: Optional[int] = None,
    adjustments_by_inverter_id: Optional[Dict[int, CalcAdjustments]] = None,
) -> List[KitSuggestionOutput]:
    has_dc = target_kwp is not None
    has_ac = target_inverter_kw is not None
    if not has_dc and not has_ac:
        raise ToolError(
            "INVALID_INPUT_RANGE",
            "suggest_kit requer target_kwp (paineis DC) OU target_inverter_kw (inversor AC).",
        )
    if has_dc and has_ac:
        raise ToolError(
            "INVALID_INPUT_RANGE",
            "suggest_kit aceita target_kwp OU target_inverter_kw, nunca os dois.",
        )

    limit = _clamp_limit(max_suggestions)
    adjustments_by_inverter_id = adjustments_by_inverter_id or {}
    default_adjustments = CalcAdjustments()

    module_brand_norm = _norm_brand(module_brand) if module_brand else None
    inverter_brand_norm = _norm_brand(inverter_brand) if inverter_brand else None

    if module_brand_norm is not None:
        available = sorted({m.brand for m in modules})
        if not any(_norm_brand(b) == module_brand_norm for b in available):
            raise ToolError(
                "BRAND_NOT_FOUND",
                f"BRAND_NOT_FOUND: marca de modulo '{module_brand}' nao existe no catalogo. "
                f"Marcas disponiveis: {', '.join(available)}.",
            )
    if inverter_brand_norm is not None:
        available = sorted({i.brand for i in inverters})
        if not any(_norm_brand(b) == inverter_brand_norm for b in available):
            raise ToolError(
                "BRAND_NOT_FOUND",
                f"BRAND_NOT_FOUND: marca de inversor '{inverter_brand}' nao existe no catalogo. "
                f"Marcas disponiveis: {', '.join(available)}.",
            )

    acc: List[KitSuggestionOutput] = []

    for mod in modules:
        if module_brand_norm is not None and _norm_brand(mod.brand) != module_brand_norm:
            continue
        for inv in inverters:
            if inv.categoria == "Microinversor":
                continue
            if inverter_brand_norm is not None and _norm_brand(inv.brand) != inverter_brand_norm:
                continue
            if inverter_phase is not None and inv.fase != inverter_phase:
                continue
            if inverter_min_kw is not None and inv.p_nom / 1000 < inverter_min_kw:
                continue
            if inverter_max_kw is not None and inv.p_nom / 1000 > inverter_max_kw:
                continue
            if inv.p_max_cc is None or inv.v_max is None:
                continue
            # Meta em kW do inversor = escolha exata do modelo de inversor
            # pela potencia nominal (nao uma janela de proximidade).
            if target_inverter_kw is not None:
                inv_kw_check = inv.p_nom / 1000
                if abs(inv_kw_check - target_inverter_kw) > INVERTER_KW_EXACT_TOLERANCE:
                    continue

            adjustments = adjustments_by_inverter_id.get(inv.inverter_id, default_adjustments)
            adjusted_inv = build_adjusted_inverter(inv, adjustments)
            candidates = _candidate_mppt_configs(adjusted_inv, mod, t_min, t_max)
            # Guarda TODOS os tamanhos validos e distintos para este par
            # modulo+inversor (nao so o "melhor") — o objetivo aqui e
            # mostrar a faixa inteira permitida pela Fotus, do minimo de
            # 70% ate o overload maximo do inversor, nao um unico ponto.
            seen_kwp: set[float] = set()

            for cfg_padded in candidates:
                try:
                    validation, ressalva_reasons = validate_kit_with_adjustments(
                        inv, mod, t_min, t_max, cfg_padded, adjustments
                    )
                except ToolError:
                    continue

                validation = recompute_badge_from_per_mppt(validation)
                if ressalva_reasons and validation.overall_badge == "Aprovado":
                    validation = dataclasses.replace(validation, overall_badge="Aprovado com ressalva")  # type: ignore[arg-type]

                if validation.overall_badge not in ("Aprovado", "Aprovado com ressalva"):
                    continue

                # Regra comercial Fotus: modulos (DC) >= X% (70% por padrao,
                # configuravel) da potencia nominal CA do inversor. Nao faz
                # parte do motor canonico bit-exato — ver
                # app/domain/calculo_solar/commercial_rules.py.
                ratio_check, _ratio_pct, ratio_reason = check_dc_ac_ratio_with_adjustments(
                    validation.total_kwp, inv.p_nom, adjustments
                )
                if not ratio_check.ok:
                    continue
                if ratio_reason:
                    ressalva_reasons = ressalva_reasons + [ratio_reason]
                    if validation.overall_badge == "Aprovado":
                        validation = dataclasses.replace(validation, overall_badge="Aprovado com ressalva")  # type: ignore[arg-type]

                # Meta em kWp de modulos = janela estreita de +-5% em
                # torno do valor digitado (nao a faixa comercial inteira).
                if target_kwp is not None:
                    if not (target_kwp * 0.95 <= validation.total_kwp <= target_kwp * 1.05):
                        continue

                kwp_key = round(validation.total_kwp, 2)
                if kwp_key in seen_kwp:
                    continue
                seen_kwp.add(kwp_key)

                if target_inverter_kw is not None:
                    inv_kw = inv.p_nom / 1000
                    score = abs(inv_kw - target_inverter_kw)
                else:
                    score = abs(validation.total_kwp - target_kwp)  # type: ignore[arg-type]

                mppt_config_output = [
                    MpptConfigOutputEntry(mppt_idx=idx, series=c.series, strings=c.strings)
                    for idx, c in enumerate(cfg_padded)
                    if c is not None
                ]
                acc.append(
                    KitSuggestionOutput(
                        module_id=mod.module_id,
                        inverter_id=inv.inverter_id,
                        mppt_config=mppt_config_output,
                        validation=validation,
                        score=score,
                        ressalva_reasons=ressalva_reasons,
                    )
                )

    # Ordena por relevancia ao alvo e, dentro do mesmo inversor/modulo,
    # em ordem crescente de potencia — para exibir a faixa 70%-overload
    # de forma legivel (do menor kit valido ao maior).
    acc.sort(key=lambda s: (s.score, s.inverter_id, s.module_id, s.validation.total_kwp))
    return acc[:limit]
