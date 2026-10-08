"""POST /api/admin/calc-settings/test-rule — simula uma regra ainda nao
salva e nunca grava nada."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.auth import CurrentUser, get_current_user
from app.infra.db import Base, get_session
from app.infra.models import CalcSettingsGlobal, CalcSettingsInverterOverride, InverterRow, ModuleRow
from app.main import app
from tests.test_conditional_rules import INV, MOD

URL = "/api/admin/calc-settings/test-rule"

RULE = {
    "name": "Sobrecarga estendida",
    "conditions": [{"metric": "overload_pct", "op": ">", "value": 50}],
    "effects": [
        {"target": "overload_limit_pct", "mode": "set", "value": 60},
        {"target": "v_max", "mode": "percent", "value": -15},
    ],
}


@pytest.fixture()
def client_and_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    with Session() as s:
        s.add(
            InverterRow(
                inverter_id=INV.inverter_id, brand=INV.brand, model=INV.model, categoria=INV.categoria,
                p_nom=INV.p_nom, p_max_cc=INV.p_max_cc, v_max=INV.v_max, v_mpp_min=INV.v_mpp_min,
                v_mpp_max=INV.v_mpp_max, num_mppt=INV.num_mppt, num_inputs=INV.num_inputs,
                mppt_currents=[{"imax": c.imax, "isc": c.isc} for c in INV.mppt_currents],
                lin_max=INV.lin_max, tensao=INV.tensao, fase=INV.fase, protection=INV.protection,
            )
        )
        s.add(
            ModuleRow(
                module_id=MOD.module_id, brand=MOD.brand, model=MOD.model, label=MOD.label, pnom=MOD.pnom,
                isc=MOD.isc, voc=MOD.voc, imp=MOD.imp, vmp=MOD.vmp, coef_v=MOD.coef_v, coef_i=MOD.coef_i,
                coef_pmp=MOD.coef_pmp, efic=MOD.efic, altura_mm=MOD.altura_mm, largura_mm=MOD.largura_mm,
                espessura_mm=MOD.espessura_mm, peso_kg=MOD.peso_kg,
            )
        )
        s.commit()

    def override_session():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(email="eng@fotus", name="eng", role="restrito")
    try:
        yield TestClient(app), Session
    finally:
        app.dependency_overrides.clear()


def body(**kit):
    return {"inverter_id": INV.inverter_id, "module_id": MOD.module_id, "t_min": 0, "t_max": 60, "rule": RULE, **kit}


def test_kit_at_the_limit_does_not_trigger_the_rule(client_and_session):
    client, _ = client_and_session
    r = client.post(URL, json=body(total_kwp=165.0))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["rule_applies"] is False
    assert data["conditions"][0]["ok"] is False and data["conditions"][0]["measured"] == pytest.approx(50.0)
    assert data["without_rule"]["limits"]["v_max"] == data["with_rule"]["limits"]["v_max"] == 1100.0
    # mesmo sem se aplicar, mostra o que a regra FARIA
    assert {e["target"] for e in data["effects"]} == {"v_max", "overload_limit_pct"}


def test_kit_above_the_limit_triggers_the_rule(client_and_session):
    client, _ = client_and_session
    data = client.post(URL, json=body(total_kwp=170.0)).json()
    assert data["rule_applies"] is True
    assert data["conditions"][0]["ok"] is True
    assert data["without_rule"]["limits"]["max_series"] == 20
    assert data["with_rule"]["limits"]["max_series"] == 17
    assert data["with_rule"]["limits"]["v_max"] == pytest.approx(935.0)
    assert data["with_rule"]["limits"]["overload_limit_kw"] == pytest.approx(176.0)
    assert data["without_rule"]["limits"]["overload_limit_kw"] == pytest.approx(165.0)
    assert data["without_rule"]["validation"] is None  # modo por potencia nao valida o kit


def test_kit_by_mppt_configuration_compares_the_verdict(client_and_session):
    client, _ = client_and_session
    data = client.post(URL, json=body(series=15, strings=2)).json()  # 10 MPPT x 15 x 2 = 300 modulos x 500 W
    assert data["kit"]["total_mods"] == 300
    assert data["kit"]["total_kwp"] == pytest.approx(150.0)  # 300 x 500 W
    # 150 kWp = 36,4% de sobrecarga => abaixo do limite: regra nao se aplica, nada muda
    assert data["rule_applies"] is False
    assert data["without_rule"]["validation"]["overall_badge"] == data["with_rule"]["validation"]["overall_badge"]

    data = client.post(URL, json=body(series=17, strings=2)).json()  # 340 modulos = 170 kWp = 54,5%
    assert data["rule_applies"] is True
    assert data["without_rule"]["validation"]["overload_fail"] is True
    assert data["with_rule"]["validation"]["overload_fail"] is False
    assert data["with_rule"]["validation"]["overall_badge"] == "Aprovado com ressalva"
    assert data["with_rule"]["validation"]["ressalva_reasons"]


def test_disabled_rule_reports_it_and_does_not_apply(client_and_session):
    client, _ = client_and_session
    payload = body(total_kwp=170.0)
    payload["rule"] = {**RULE, "enabled": False}
    data = client.post(URL, json=payload).json()
    assert data["rule_enabled"] is False and data["rule_applies"] is False
    assert data["conditions"][0]["ok"] is True  # a condicao em si e' atendida


def test_nothing_is_persisted(client_and_session):
    client, Session = client_and_session
    client.post(URL, json=body(total_kwp=170.0))
    with Session() as s:
        glob = s.get(CalcSettingsGlobal, 1)
        assert glob is None or not glob.conditional_rules
        assert s.query(CalcSettingsInverterOverride).count() == 0


@pytest.mark.parametrize(
    "payload",
    [
        {"inverter_id": INV.inverter_id, "module_id": MOD.module_id, "rule": RULE},  # sem kit
        {"inverter_id": INV.inverter_id, "module_id": MOD.module_id, "rule": RULE, "series": 10, "strings": 2, "total_kwp": 100},
        {"inverter_id": INV.inverter_id, "module_id": MOD.module_id, "total_kwp": 100, "rule": {**RULE, "effects": []}},
        {"inverter_id": INV.inverter_id, "module_id": MOD.module_id, "total_kwp": 100,
         "rule": {**RULE, "effects": [{"target": "nada", "mode": "set", "value": 1}]}},
    ],
)
def test_invalid_requests_are_rejected(client_and_session, payload):
    client, _ = client_and_session
    assert client.post(URL, json=payload).status_code == 422


def test_unknown_inverter_or_module_is_404(client_and_session):
    client, _ = client_and_session
    assert client.post(URL, json={**body(total_kwp=100), "inverter_id": 999999}).status_code == 404
    assert client.post(URL, json={**body(total_kwp=100), "module_id": 999999}).status_code == 404


def test_only_restricted_users_can_test(client_and_session):
    client, _ = client_and_session
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(email="v@fotus", name="v", role="comercial")
    assert client.post(URL, json=body(total_kwp=170.0)).status_code == 403
