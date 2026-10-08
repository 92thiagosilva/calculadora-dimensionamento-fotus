"""Regras condicionais de ajuste — cenario do Solplanet ASW 110K-LT:
sobrecarga ate 50% mantem V max = 1100 V; acima disso (ate 60%,
aprovado pelo fabricante) o V max cai 15% (935 V)."""

from __future__ import annotations

import pytest

from app.domain.calculo_solar.calc_adjustments import CalcAdjustments, validate_kit_with_rules
from app.domain.calculo_solar.conditional_rules import (
    RuleValidationError,
    apply_rules,
    kit_context,
    merge_rules,
    rule_from_dict,
    rule_to_dict,
    rules_from_json,
)
from app.domain.calculo_solar.suggestion import suggest_kit
from app.domain.calculo_solar.validate_kit import MpptConfigInput
from app.domain.catalogo.inverter import Inverter, MpptCurrents
from app.domain.catalogo.module import Module

T_MIN, T_MAX = 0.0, 60.0

INV = Inverter(
    inverter_id=199,
    brand="SOLPLANET",
    model="ASW 110K-LT (10 MPPT)",
    categoria="On-Grid",
    p_nom=110000.0,
    p_max_cc=165000.0,  # 50% de sobrecarga cadastrada
    v_max=1100.0,
    v_mpp_min=250.0,
    v_mpp_max=1000.0,
    num_mppt=10,
    num_inputs=20,
    mppt_currents=[MpptCurrents(imax=32.0, isc=48.0) for _ in range(10)],
    lin_max=[2.0] * 10,
    tensao=380.0,
    fase="Trifásico",
    protection=None,
)

# 500 Wp => 330 modulos = exatamente 165 kWp = 50% de sobrecarga no INV.
MOD = Module(
    module_id=1,
    brand="TESTE",
    model="500W",
    label="TESTE 500W",
    pnom=500.0,
    isc=14.0,
    voc=50.0,
    imp=13.0,
    vmp=42.0,
    coef_v=-0.25,
    coef_i=0.05,
    coef_pmp=-0.3,
    efic=None,
    altura_mm=2000,
    largura_mm=1000,
    espessura_mm=30,
    peso_kg=25,
)

ASW_RULE = rule_from_dict(
    {
        "id": "asw-overload-60",
        "name": "Sobrecarga estendida até 60% (fabricante)",
        "conditions": [{"metric": "overload_pct", "op": ">", "value": 50}],
        "effects": [
            {"target": "overload_limit_pct", "mode": "set", "value": 60},
            {"target": "v_max", "mode": "percent", "value": -15},
        ],
    }
)
ADJ = CalcAdjustments(rules=(ASW_RULE,))


def cfg(series_per_mppt, strings=2):
    return [MpptConfigInput(series=s, strings=strings) for s in series_per_mppt]


def test_overload_exactly_at_limit_keeps_catalog_vmax():
    # 5 MPPT de 16x2 + 5 de 17x2 = 330 modulos = 165 kWp = 50,0% de sobrecarga
    out = validate_kit_with_rules(INV, MOD, T_MIN, T_MAX, cfg([16] * 5 + [17] * 5), ADJ)
    assert out.applied_rules == []
    assert not out.rules_relaxed
    assert out.result.total_kwp == pytest.approx(165.0)
    assert out.result.per_mppt[0].limits.max_series_voc == 20  # 1100 V


def test_above_limit_applies_derated_vmax_and_extends_overload():
    out = validate_kit_with_rules(INV, MOD, T_MIN, T_MAX, cfg([17] * 10), ADJ)  # 170 kWp = 54,5%
    assert [a.rule_id for a in out.applied_rules] == ["asw-overload-60"]
    assert out.result.per_mppt[0].limits.max_series_voc == 17  # floor(935 / 53,125)
    assert not out.result.overload_fail  # limite estendido para 176 kW
    assert out.result.all_mppt_ok
    assert out.rules_relaxed
    assert out.reasons and "935.0 V" in out.reasons[0] and "1100.0 V" in out.reasons[0]
    assert "60.0 %" in out.reasons[0]


def test_derated_vmax_reduces_modules_per_string():
    # 9 MPPT 17x2 + 1 MPPT 18x2 = 342 modulos (55,5%): a serie de 18 so cabia com 1100 V
    out = validate_kit_with_rules(INV, MOD, T_MIN, T_MAX, cfg([17] * 9 + [18]), ADJ)
    assert out.applied_rules
    last = out.result.per_mppt[-1]
    assert last.series == 18 and not last.series_ok
    assert not out.result.all_mppt_ok

    # a mesma serie de 18 num kit pequeno (regra nao se aplica) continua valida
    small = [MpptConfigInput(series=18, strings=2)] + [None] * 9
    small_out = validate_kit_with_rules(INV, MOD, T_MIN, T_MAX, small, ADJ)
    assert small_out.applied_rules == []
    assert small_out.result.per_mppt[0].series_ok


def test_above_extended_limit_still_fails_overload():
    out = validate_kit_with_rules(INV, MOD, T_MIN, T_MAX, cfg([18] * 10), ADJ)  # 180 kWp = 63,6% > 60%
    assert out.applied_rules
    assert out.result.overload_fail


def test_without_rule_overload_above_catalog_fails():
    out = validate_kit_with_rules(INV, MOD, T_MIN, T_MAX, cfg([17] * 10), CalcAdjustments())
    assert out.result.overload_fail
    assert out.applied_rules == []


def test_disabled_rule_is_ignored():
    disabled = rule_from_dict({**rule_to_dict(ASW_RULE), "enabled": False})
    out = validate_kit_with_rules(INV, MOD, T_MIN, T_MAX, cfg([17] * 10), CalcAdjustments(rules=(disabled,)))
    assert out.applied_rules == []
    assert out.result.overload_fail


def test_multiple_conditions_are_anded():
    rule = rule_from_dict(
        {
            "name": "faixa 50-52",
            "conditions": [
                {"metric": "overload_pct", "op": ">", "value": 50},
                {"metric": "overload_pct", "op": "<=", "value": 52},
            ],
            "effects": [{"target": "v_max", "mode": "delta", "value": -100}],
        }
    )
    _, hit = apply_rules(INV, [rule], kit_context(total_dc_w=166_000, p_nom_w=110_000))  # 50,9%
    _, miss = apply_rules(INV, [rule], kit_context(total_dc_w=170_000, p_nom_w=110_000))  # 54,5%
    assert len(hit) == 1 and miss == []


def test_other_metric_and_current_target():
    rule = rule_from_dict(
        {
            "name": "acima de 150 kWp",
            "conditions": [{"metric": "total_kwp", "op": ">=", "value": 150}],
            "effects": [{"target": "imax", "mode": "delta", "value": 3}],
        }
    )
    inv, applied = apply_rules(INV, [rule], kit_context(total_dc_w=150_000, p_nom_w=110_000))
    assert applied and all(c.imax == 35.0 for c in inv.mppt_currents)
    assert all(c.imax == 32.0 for c in INV.mppt_currents)  # original intacto (dataclass congelado)


def test_merge_rules_inverter_overrides_global_by_id():
    global_rule = rule_from_dict({"id": "r1", "name": "global", "effects": [{"target": "v_max", "mode": "delta", "value": -1}]})
    other = rule_from_dict({"id": "r2", "name": "outra", "effects": [{"target": "v_max", "mode": "delta", "value": -2}]})
    own = rule_from_dict({"id": "r1", "name": "do inversor", "enabled": False, "effects": [{"target": "v_max", "mode": "delta", "value": -9}]})
    merged = merge_rules([global_rule, other], [own])
    assert [(r.id, r.name) for r in merged] == [("r2", "outra"), ("r1", "do inversor")]


@pytest.mark.parametrize(
    "bad",
    [
        {"name": "", "effects": [{"target": "v_max", "mode": "set", "value": 1}]},
        {"name": "x", "effects": []},
        {"name": "x", "effects": [{"target": "inexistente", "mode": "set", "value": 1}]},
        {"name": "x", "effects": [{"target": "v_max", "mode": "multiplica", "value": 1}]},
        {"name": "x", "effects": [{"target": "v_max", "mode": "percent", "value": -100}]},
        {"name": "x", "conditions": [{"metric": "nada", "op": ">", "value": 1}], "effects": [{"target": "v_max", "mode": "set", "value": 1}]},
        {"name": "x", "conditions": [{"metric": "total_kwp", "op": "~", "value": 1}], "effects": [{"target": "v_max", "mode": "set", "value": 1}]},
    ],
)
def test_invalid_rules_are_rejected(bad):
    with pytest.raises(RuleValidationError):
        rule_from_dict(bad)


def test_rules_from_json_skips_invalid_entries_and_generates_ids():
    rules = rules_from_json(
        [
            {"name": "ok", "effects": [{"target": "v_max", "mode": "set", "value": 900}]},
            {"name": "quebrada", "effects": []},
        ]
    )
    assert len(rules) == 1 and rules[0].id


def test_suggestion_finds_kits_inside_the_derated_regime():
    suggestions = suggest_kit(
        [MOD],
        [INV],
        T_MIN,
        T_MAX,
        target_kwp=170.0,
        adjustments_by_inverter_id={INV.inverter_id: ADJ},
    )
    assert suggestions, "deveria sugerir kits na faixa de sobrecarga estendida (>50%)"
    for s in suggestions:
        assert s.validation.overall_badge == "Aprovado com ressalva"
        assert s.applied_rules and s.ressalva_reasons
        assert all(c.series <= 17 for c in s.mppt_config)  # V max de 935 V respeitado
        assert 161.5 <= s.validation.total_kwp <= 178.5
