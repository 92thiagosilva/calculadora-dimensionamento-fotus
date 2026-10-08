"""Regras condicionais de ajuste do inversor — NAO fazem parte do motor
canonico (`validate_kit.py`/`mppt_limits.py`); sao uma camada configuravel
aplicada ANTES de chamar o motor, que continua intocado.

Motivacao: alguns fabricantes aprovam operar o inversor acima da
sobrecarga do datasheet, mas com outros limites. Ex.: Solplanet ASW
110K-LT (10 MPPT): sobrecarga de 50% mantem V max = 1100 V; ate 60%
(aprovado pelo fabricante) o V max cai 15% (935 V). Como o V max define
quantos modulos cabem em serie, o limite da string passa a depender do
tamanho do kit — por isso a regra e CONDICIONAL ao kit.

Uma regra tem:
- `conditions`: lista de condicoes (TODAS precisam ser verdadeiras — E
  logico) sobre uma metrica do kit (`METRICS`): `metrica OP valor`.
  Lista vazia = a regra sempre se aplica.
- `effects`: lista de efeitos sobre o inversor (`TARGETS`), cada um com
  um modo (`MODES`): `set` (valor absoluto), `delta` (soma) ou
  `percent` (variacao percentual sobre o valor atual).

Efeitos de uma regra sao aplicados em ordem, e as regras em ordem da
lista, sempre por cima do inversor ja ajustado pelos ajustes estaticos
(`calc_adjustments.build_adjusted_inverter`).

Para criar um novo tipo de regra no futuro basta registrar uma nova
metrica em `METRICS` (o que medir no kit) e/ou um novo alvo em `TARGETS`
(o que alterar no inversor) — a tela de Configuracoes le esses
registros pela API e passa a oferece-los sem mudar o frontend.

Regras globais valem para todos os inversores; regras de um inversor
somam-se as globais e, havendo o mesmo `id`, a do inversor substitui a
global (permite, por exemplo, desativar uma regra global para um modelo).
"""

from __future__ import annotations

import dataclasses
import logging
import operator
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from app.domain.catalogo.inverter import Inverter

logger = logging.getLogger(__name__)

# Casas decimais usadas ao comparar a metrica do kit com o limite da
# condicao, para que um kit exatamente no limite (ex.: 165 kWp em um
# inversor de 110 kW = 50% de sobrecarga) nao seja empurrado para o
# lado errado por ruido de ponto flutuante.
COMPARE_DECIMALS = 9


class RuleValidationError(ValueError):
    """Regra mal formada (metrica/alvo/modo/operador desconhecido, etc.)."""


# ---- Metricas do kit (o que as condicoes medem) ----


@dataclass(frozen=True)
class KitContext:
    """O que se sabe do kit ao avaliar as condicoes."""

    total_dc_w: float
    """Potencia total dos modulos, em W (n_modulos * Pnom do modulo)."""
    p_nom_w: float
    """Potencia nominal CA do inversor, em W."""


@dataclass(frozen=True)
class RuleMetric:
    key: str
    label: str
    unit: str
    compute: Callable[[KitContext], float]


def _overload_pct(ctx: KitContext) -> float:
    return (ctx.total_dc_w / ctx.p_nom_w - 1) * 100 if ctx.p_nom_w > 0 else 0.0


METRICS: Dict[str, RuleMetric] = {
    m.key: m
    for m in (
        RuleMetric(
            "overload_pct",
            "Sobrecarga do kit (CC dos módulos ÷ CA do inversor − 1)",
            "%",
            _overload_pct,
        ),
        RuleMetric("total_kwp", "Potência total dos módulos do kit", "kWp", lambda c: c.total_dc_w / 1000),
    )
}

OPERATORS: Dict[str, Tuple[str, Callable[[float, float], bool]]] = {
    ">": ("maior que", operator.gt),
    ">=": ("maior ou igual a", operator.ge),
    "<": ("menor que", operator.lt),
    "<=": ("menor ou igual a", operator.le),
}


# ---- Alvos (o que os efeitos alteram no inversor) ----


@dataclass(frozen=True)
class RuleTarget:
    key: str
    label: str
    unit: str
    get: Callable[[Inverter], List[float]]
    """Valores atuais afetados (lista vazia = o inversor nao tem esse dado; o efeito e ignorado)."""
    set: Callable[[Inverter, List[float]], Inverter]


def _scalar_target(key: str, label: str, unit: str, attr: str) -> RuleTarget:
    def get(inv: Inverter) -> List[float]:
        v = getattr(inv, attr)
        return [] if v is None else [v]

    def set_(inv: Inverter, values: List[float]) -> Inverter:
        return dataclasses.replace(inv, **{attr: values[0]})

    return RuleTarget(key, label, unit, get, set_)


def _current_target(key: str, label: str, attr: str) -> RuleTarget:
    """Corrente por MPPT: o efeito vale para TODOS os MPPTs do inversor."""

    def get(inv: Inverter) -> List[float]:
        return [getattr(c, attr) for c in inv.mppt_currents]

    def set_(inv: Inverter, values: List[float]) -> Inverter:
        return dataclasses.replace(
            inv,
            mppt_currents=[dataclasses.replace(c, **{attr: v}) for c, v in zip(inv.mppt_currents, values)],
        )

    return RuleTarget(key, label, "A", get, set_)


def _overload_limit_get(inv: Inverter) -> List[float]:
    if inv.p_max_cc is None or inv.p_nom <= 0:
        return []
    return [(inv.p_max_cc / inv.p_nom - 1) * 100]


def _overload_limit_set(inv: Inverter, values: List[float]) -> Inverter:
    return dataclasses.replace(inv, p_max_cc=inv.p_nom * (1 + values[0] / 100))


TARGETS: Dict[str, RuleTarget] = {
    t.key: t
    for t in (
        _scalar_target("v_max", "V max", "V", "v_max"),
        _scalar_target("v_mpp_min", "V MPP min", "V", "v_mpp_min"),
        _scalar_target("v_mpp_max", "V MPP max", "V", "v_mpp_max"),
        _current_target("imax", "I max por MPPT", "imax"),
        _current_target("isc", "Isc max por MPPT", "isc"),
        RuleTarget(
            "overload_limit_pct",
            "Sobrecarga máxima permitida",
            "%",
            _overload_limit_get,
            _overload_limit_set,
        ),
    )
}

MODES: Dict[str, str] = {
    "set": "definir valor",
    "delta": "somar",
    "percent": "variar em %",
}


def _apply_mode(mode: str, current: float, value: float) -> float:
    if mode == "set":
        new = value
    elif mode == "delta":
        new = current + value
    else:  # percent
        new = current * (1 + value / 100)
    return max(0.0, new)


# ---- Regra ----


@dataclass(frozen=True)
class RuleCondition:
    metric: str
    op: str
    value: float


@dataclass(frozen=True)
class RuleEffect:
    target: str
    mode: str
    value: float


@dataclass(frozen=True)
class AdjustmentRule:
    id: str
    name: str
    conditions: Tuple[RuleCondition, ...] = ()
    effects: Tuple[RuleEffect, ...] = ()
    enabled: bool = True


@dataclass(frozen=True)
class AppliedRule:
    rule_id: str
    name: str
    description: str


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise RuleValidationError(msg)


def _number(raw: Any, what: str) -> float:
    _require(isinstance(raw, (int, float)) and not isinstance(raw, bool), f"{what} deve ser um número.")
    _require(raw == raw and abs(raw) != float("inf"), f"{what} deve ser um número finito.")
    return float(raw)


def rule_from_dict(d: Dict[str, Any]) -> AdjustmentRule:
    """Valida e converte o formato JSON (banco/API) para `AdjustmentRule`.
    Gera um `id` quando ausente. Levanta `RuleValidationError`."""
    _require(isinstance(d, dict), "Regra deve ser um objeto.")
    name = str(d.get("name") or "").strip()
    _require(bool(name), "Toda regra precisa de um nome.")

    conditions: List[RuleCondition] = []
    for c in d.get("conditions") or []:
        metric, op = c.get("metric"), c.get("op")
        _require(metric in METRICS, f"Métrica desconhecida: {metric!r}.")
        _require(op in OPERATORS, f"Operador desconhecido: {op!r}.")
        conditions.append(RuleCondition(metric, op, _number(c.get("value"), "O valor da condição")))

    effects: List[RuleEffect] = []
    for e in d.get("effects") or []:
        target, mode = e.get("target"), e.get("mode")
        _require(target in TARGETS, f"Alvo desconhecido: {target!r}.")
        _require(mode in MODES, f"Modo desconhecido: {mode!r}.")
        value = _number(e.get("value"), "O valor do efeito")
        if mode == "percent":
            _require(value > -100, "Variação percentual deve ser maior que -100%.")
        if mode == "set":
            _require(value >= 0, "Valor definido não pode ser negativo.")
        effects.append(RuleEffect(target, mode, value))
    _require(len(effects) > 0, "Toda regra precisa de pelo menos um efeito.")

    rule_id = str(d.get("id") or "").strip() or uuid.uuid4().hex[:8]
    return AdjustmentRule(
        id=rule_id,
        name=name,
        conditions=tuple(conditions),
        effects=tuple(effects),
        enabled=bool(d.get("enabled", True)),
    )


def rule_to_dict(rule: AdjustmentRule) -> Dict[str, Any]:
    return {
        "id": rule.id,
        "name": rule.name,
        "enabled": rule.enabled,
        "conditions": [{"metric": c.metric, "op": c.op, "value": c.value} for c in rule.conditions],
        "effects": [{"target": e.target, "mode": e.mode, "value": e.value} for e in rule.effects],
    }


def rules_from_json(raw: Optional[Iterable[Dict[str, Any]]]) -> Tuple[AdjustmentRule, ...]:
    """Le a lista de regras gravada no banco. Uma regra invalida e'
    ignorada (com aviso no log) em vez de derrubar todos os calculos."""
    rules: List[AdjustmentRule] = []
    for item in raw or []:
        try:
            rules.append(rule_from_dict(item))
        except (RuleValidationError, AttributeError, TypeError) as exc:
            logger.warning("Regra condicional invalida ignorada (%s): %r", exc, item)
    return tuple(rules)


def merge_rules(
    global_rules: Sequence[AdjustmentRule], inverter_rules: Sequence[AdjustmentRule]
) -> Tuple[AdjustmentRule, ...]:
    """Globais + do inversor; mesmo `id` => a do inversor substitui a global."""
    own_ids = {r.id for r in inverter_rules}
    return tuple(r for r in global_rules if r.id not in own_ids) + tuple(inverter_rules)


def rule_catalog() -> Dict[str, Any]:
    """Descricao dos blocos disponiveis (metricas, operadores, alvos,
    modos) para a tela de Configuracoes montar o editor de regras."""
    return {
        "metrics": [{"key": m.key, "label": m.label, "unit": m.unit} for m in METRICS.values()],
        "operators": [{"key": k, "label": label} for k, (label, _fn) in OPERATORS.items()],
        "targets": [{"key": t.key, "label": t.label, "unit": t.unit} for t in TARGETS.values()],
        "modes": [{"key": k, "label": label} for k, label in MODES.items()],
    }


# ---- Avaliacao / aplicacao ----


def kit_context(total_dc_w: float, p_nom_w: float) -> KitContext:
    return KitContext(total_dc_w=total_dc_w, p_nom_w=p_nom_w)


def rule_applies(rule: AdjustmentRule, ctx: KitContext) -> bool:
    if not rule.enabled:
        return False
    for c in rule.conditions:
        measured = round(METRICS[c.metric].compute(ctx), COMPARE_DECIMALS)
        limit = round(c.value, COMPARE_DECIMALS)
        if not OPERATORS[c.op][1](measured, limit):
            return False
    return True


def _fmt(n: float) -> str:
    return f"{n:.1f}"


@dataclass(frozen=True)
class EffectChange:
    """Um efeito que de fato mudou algum valor do inversor."""

    target: str
    label: str
    unit: str
    mode: str
    before: Tuple[float, ...]
    after: Tuple[float, ...]

    def text(self) -> str:
        unit = f" {self.unit}"
        shown_before = "/".join(dict.fromkeys(_fmt(v) for v in self.before))
        shown_after = "/".join(dict.fromkeys(_fmt(v) for v in self.after))
        return f"{self.label}: {shown_before}{unit} → {shown_after}{unit}"


def apply_effects_detailed(inv: Inverter, rule: AdjustmentRule) -> Tuple[Inverter, List[EffectChange]]:
    """Aplica os efeitos da regra em `inv` (sem checar as condicoes).
    Retorna o novo inversor e um `EffectChange` por efeito que de fato
    mudou algum valor."""
    changes: List[EffectChange] = []
    for effect in rule.effects:
        target = TARGETS[effect.target]
        before = target.get(inv)
        if not before:
            continue
        after = [_apply_mode(effect.mode, v, effect.value) for v in before]
        if after == before:
            continue
        inv = target.set(inv, after)
        changes.append(EffectChange(target.key, target.label, target.unit, effect.mode, tuple(before), tuple(after)))
    return inv, changes


def _apply_effects(inv: Inverter, rule: AdjustmentRule) -> Tuple[Inverter, List[str]]:
    """Como `apply_effects_detailed`, mas com uma frase por efeito."""
    inv, changes = apply_effects_detailed(inv, rule)
    return inv, [c.text() for c in changes]


@dataclass(frozen=True)
class ConditionResult:
    metric: str
    label: str
    unit: str
    measured: float
    op: str
    op_label: str
    threshold: float
    ok: bool


def evaluate_conditions(rule: AdjustmentRule, ctx: KitContext) -> List[ConditionResult]:
    """Avalia cada condicao da regra para o kit `ctx` (inclusive quando a
    regra esta desativada — usado pelo botao 'Testar regra')."""
    results: List[ConditionResult] = []
    for c in rule.conditions:
        metric = METRICS[c.metric]
        measured = metric.compute(ctx)
        ok = OPERATORS[c.op][1](round(measured, COMPARE_DECIMALS), round(c.value, COMPARE_DECIMALS))
        results.append(
            ConditionResult(c.metric, metric.label, metric.unit, measured, c.op, OPERATORS[c.op][0], c.value, ok)
        )
    return results


def _describe(rule: AdjustmentRule, ctx: KitContext, changes: List[str]) -> str:
    cond_parts = []
    for c in rule.conditions:
        metric = METRICS[c.metric]
        measured = metric.compute(ctx)
        cond_parts.append(
            f"{metric.label} = {_fmt(measured)} {metric.unit} "
            f"({OPERATORS[c.op][0]} {_fmt(c.value)} {metric.unit})"
        )
    when = "; ".join(cond_parts) if cond_parts else "regra sempre ativa"
    effects = "; ".join(changes) if changes else "sem alteração de valores"
    return f'Regra condicional "{rule.name}" aplicada — {when}. Efeito: {effects}.'


def apply_rules(
    inv: Inverter, rules: Sequence[AdjustmentRule], ctx: KitContext
) -> Tuple[Inverter, List[AppliedRule]]:
    """Aplica em `inv` as regras cujas condicoes o kit (`ctx`) satisfaz."""
    applied: List[AppliedRule] = []
    for rule in rules:
        if not rule_applies(rule, ctx):
            continue
        inv, changes = _apply_effects(inv, rule)
        applied.append(AppliedRule(rule.id, rule.name, _describe(rule, ctx, changes)))
    return inv, applied


def rule_variant_inverters(inv: Inverter, rules: Sequence[AdjustmentRule]) -> List[Inverter]:
    """Uma copia de `inv` por regra ativa, com os efeitos dessa regra
    aplicados SEM checar as condicoes. Serve para o gerador de sugestoes
    montar candidatos dentro dos limites que valem quando a regra esta
    em vigor (ex.: strings maximas com o V max reduzido) — a validacao
    real do kit continua checando as condicoes de verdade."""
    variants: List[Inverter] = []
    for rule in rules:
        if not rule.enabled:
            continue
        variant, changes = _apply_effects(inv, rule)
        if changes:
            variants.append(variant)
    return variants
