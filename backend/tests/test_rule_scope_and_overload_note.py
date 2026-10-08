"""Escopo da regra por inversor (todos / escolhidos) e aviso de
sobrecarga cadastrada substituida por um ajuste."""

from __future__ import annotations

import dataclasses

import pytest

from app.domain.calculo_solar.calc_adjustments import CalcAdjustments, overload_override_note
from app.domain.calculo_solar.conditional_rules import (
    RuleValidationError,
    rule_from_dict,
    rule_in_scope,
    rule_to_dict,
)
from app.infra import repository
from app.infra.models import InverterRow
from tests.test_conditional_rules import INV
from tests.test_rule_tester_api import RULE, URL, body, client_and_session  # noqa: F401  (fixture)

EFFECT = [{"target": "v_max", "mode": "percent", "value": -15}]


def rule(**kw):
    return rule_from_dict({"name": "r", "effects": EFFECT, **kw})


# ---- dominio ----


def test_scope_defaults_to_all_inverters():
    r = rule()
    assert r.inverter_ids is None
    assert rule_in_scope(r, 1) and rule_in_scope(r, 999)
    assert rule_to_dict(r)["inverter_ids"] is None


def test_scope_with_selected_inverters_is_normalized_and_round_trips():
    r = rule(inverter_ids=[30, 10, 10, 20])
    assert r.inverter_ids == (10, 20, 30)
    assert rule_in_scope(r, 20) and not rule_in_scope(r, 21)
    assert rule_from_dict(rule_to_dict(r)) == r


@pytest.mark.parametrize("bad", [[], "199", [1, "2"], [True]])
def test_invalid_scope_is_rejected(bad):
    with pytest.raises(RuleValidationError):
        rule(inverter_ids=bad)


# ---- aviso de sobrecarga substituida ----


def test_note_when_override_replaces_catalog_overload():
    note = overload_override_note(INV, CalcAdjustments(overload_pct_override=0.0), "global")
    assert note is not None
    assert note["catalog_limit_kw"] == pytest.approx(165.0) and note["effective_limit_kw"] == pytest.approx(110.0)
    assert "reduz" in note["message"] and "ajuste global" in note["message"]
    assert "+0.0%" in note["message"] and "+50.0%" in note["message"]


def test_note_says_amplia_when_override_is_higher_and_names_the_inverter_source():
    note = overload_override_note(INV, CalcAdjustments(overload_pct_override=60.0), "inverter")
    assert "amplia" in note["message"] and "deste inversor" in note["message"]


def test_no_note_when_nothing_replaces_the_catalog():
    assert overload_override_note(INV, CalcAdjustments(), None) is None
    assert overload_override_note(INV, CalcAdjustments(overload_pct_override=50.0), "global") is None  # igual ao cadastro
    no_limit = dataclasses.replace(INV, p_max_cc=None)
    assert overload_override_note(no_limit, CalcAdjustments(overload_pct_override=0.0), "global") is None


# ---- repositorio: escopo ao mesclar ----


@pytest.fixture()
def db(client_and_session):  # noqa: F811
    _client, Session = client_and_session
    with Session() as s:
        other = s.get(InverterRow, INV.inverter_id)
        s.add(
            InverterRow(
                inverter_id=200, brand=other.brand, model="OUTRO", categoria=other.categoria, p_nom=other.p_nom,
                p_max_cc=other.p_max_cc, v_max=other.v_max, v_mpp_min=other.v_mpp_min, v_mpp_max=other.v_mpp_max,
                num_mppt=other.num_mppt, num_inputs=other.num_inputs, mppt_currents=other.mppt_currents,
                lin_max=other.lin_max, tensao=other.tensao, fase=other.fase, protection=other.protection,
            )
        )
        s.commit()
        yield s


def names(adj):
    return sorted(r.name for r in adj.rules)


def test_global_rule_scope_is_respected_per_inverter(db):
    repository.update_global_calc_settings(
        db,
        {
            "conditional_rules": [
                {"id": "todos", "name": "para todos", "effects": EFFECT},
                {"id": "so199", "name": "so 199", "effects": EFFECT, "inverter_ids": [INV.inverter_id]},
            ]
        },
        "eng",
    )
    assert names(repository.get_effective_adjustments(db, INV.inverter_id)) == ["para todos", "so 199"]
    assert names(repository.get_effective_adjustments(db, 200)) == ["para todos"]
    batch = repository.get_all_effective_adjustments(db)
    assert names(batch[INV.inverter_id]) == ["para todos", "so 199"] and names(batch[200]) == ["para todos"]


def test_inverter_own_rules_always_apply_and_replace_global_with_same_id(db):
    repository.update_global_calc_settings(
        db, {"conditional_rules": [{"id": "r1", "name": "global", "effects": EFFECT}]}, "eng"
    )
    repository.update_inverter_override(
        db,
        200,
        # escopo informado no override e' ignorado: vale para o proprio inversor
        {"conditional_rules": [{"id": "r1", "name": "do 200", "enabled": False, "effects": EFFECT, "inverter_ids": [1]}]},
        "eng",
    )
    adj = repository.get_effective_adjustments(db, 200)
    assert [(r.name, r.enabled, r.inverter_ids) for r in adj.rules] == [("do 200", False, None)]
    assert names(repository.get_effective_adjustments(db, INV.inverter_id)) == ["global"]


# ---- API ----


def test_tester_reports_out_of_scope_and_does_not_apply(client_and_session):  # noqa: F811
    client, _ = client_and_session
    payload = body(total_kwp=170.0)
    payload["rule"] = {**RULE, "inverter_ids": [12345]}
    data = client.post(URL, json=payload).json()
    assert data["rule_in_scope"] is False and data["rule_applies"] is False
    assert data["with_rule"]["limits"]["max_series"] == data["without_rule"]["limits"]["max_series"] == 20

    payload["rule"] = {**RULE, "inverter_ids": [INV.inverter_id]}
    data = client.post(URL, json=payload).json()
    assert data["rule_in_scope"] is True and data["rule_applies"] is True


def test_empty_scope_is_rejected_by_the_api(client_and_session):  # noqa: F811
    client, _ = client_and_session
    payload = body(total_kwp=170.0)
    payload["rule"] = {**RULE, "inverter_ids": []}
    assert client.post(URL, json=payload).status_code == 422


def test_tester_and_validate_kit_warn_when_overload_is_overridden(client_and_session):  # noqa: F811
    client, Session = client_and_session
    assert client.post(URL, json=body(total_kwp=100.0)).json()["overload_override"] is None

    with Session() as s:
        repository.update_global_calc_settings(s, {"overload_pct_override": 0.0}, "eng")

    tested = client.post(URL, json=body(total_kwp=100.0)).json()
    assert tested["overload_override"]["source"] == "global"
    assert tested["overload_override"]["effective_limit_kw"] == pytest.approx(110.0)
    assert tested["without_rule"]["limits"]["overload_limit_kw"] == pytest.approx(110.0)

    validated = client.post(
        "/api/dimensionamento/validate-kit",
        json={"inverter_id": INV.inverter_id, "module_id": 1, "t_min": 0, "t_max": 60,
              "mppt_config": [{"series": 14, "strings": 2}] * 10},
    ).json()
    assert validated["overload_fail"] is True  # 140 kWp > 110 kW por causa do ajuste de 0%
    assert validated["overload_override"]["catalog_limit_kw"] == pytest.approx(165.0)
