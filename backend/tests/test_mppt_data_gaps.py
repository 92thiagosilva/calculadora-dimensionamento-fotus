"""MPPT configurado com o cadastro de corrente incompleto: antes o kit podia sair
'Aprovado' sem aviso (o motor omite o MPPT do detalhamento e o veredito era
recalculado so com os MPPTs presentes)."""

from __future__ import annotations

from app.api.routes_dimensionamento import build_validation_response
from app.domain.calculo_solar.calc_adjustments import CalcAdjustments
from app.domain.calculo_solar.suggestion import suggest_kit
from app.domain.calculo_solar.validate_kit import MpptConfigInput
from app.domain.catalogo.inverter import Inverter, MpptCurrents
from app.domain.catalogo.module import Module

MOD = Module(
    module_id=1, brand="T", model="550", label="T 550", pnom=550.0, isc=13.9, voc=50.0, imp=13.0, vmp=42.0,
    coef_v=-0.25, coef_i=0.045, coef_pmp=-0.3, efic=None, altura_mm=2000, largura_mm=1000, espessura_mm=30, peso_kg=25,
)
ADJ = CalcAdjustments()


def inv(currents, lin_max=(2.0, 2.0), num_mppt=2, p_max_cc=60000.0) -> Inverter:
    return Inverter(
        inverter_id=1, brand="T", model="X", categoria=None, p_nom=40000.0, p_max_cc=p_max_cc, v_max=1100.0,
        v_mpp_min=200.0, v_mpp_max=1000.0, num_mppt=num_mppt, num_inputs=num_mppt * 2,
        mppt_currents=[MpptCurrents(imax=a, isc=b) for a, b in currents], lin_max=list(lin_max),
        tensao=380.0, fase="Trifásico", protection=None,
    )


def validate(i: Inverter, cfg):
    return build_validation_response(i, MOD, 0, 60, cfg, ADJ)


BOTH = [MpptConfigInput(18, 2), MpptConfigInput(18, 2)]  # 72 modulos = 39,6 kWp = 99% do inversor


def test_control_complete_data_is_approved_without_remarks():
    r = validate(inv([(32, 48), (32, 48)]), BOTH)
    assert r["overall_badge"] == "Aprovado"
    assert r["mppts_sem_dados"] == [] and r["mppts_corrente_ignorada"] == [] and r["mppt_data_note"] is None


def test_configured_mppt_without_current_row_is_not_approved():
    r = validate(inv([(32, 48)]), BOTH)  # 2 MPPTs declarados, corrente cadastrada so para o 1o
    assert r["overall_badge"] == "Verificar"
    assert r["mppts_sem_dados"] == [1]
    assert r["all_mppt_ok"] is False
    assert "MPPT 2" in r["mppt_data_note"] and "cadastro" in r["mppt_data_note"]
    assert len(r["per_mppt"]) == 1  # o motor segue omitindo o MPPT sem dados do detalhamento


def test_unused_mppt_without_current_row_is_still_valid():
    # Nao usar um MPPT e' escolha valida do vendedor: so a ausencia da nota de dados importa aqui
    # (o veredito pode ser outro, por exemplo abaixo do minimo CC/CA).
    r = validate(inv([(32, 48)]), [MpptConfigInput(18, 2), None])
    assert r["mppts_sem_dados"] == [] and r["mppt_data_note"] is None


def test_several_mppts_without_data_are_listed_together():
    r = validate(inv([(32, 48)], lin_max=(2.0, 2.0, 2.0), num_mppt=3), [MpptConfigInput(18, 2)] * 3)
    assert r["mppts_sem_dados"] == [1, 2]
    assert "MPPTs 2, 3" in r["mppt_data_note"]


def test_zeroed_current_is_approved_only_with_remark_and_assumes_99():
    r = validate(inv([(0, 0), (32, 48)]), BOTH)
    assert r["overall_badge"] == "Aprovado com ressalva"
    assert r["mppts_corrente_ignorada"] == [0] and r["mppts_sem_dados"] == []
    assert any("limite de corrente foi ignorado" in x and "MPPT 1" in x and "2 entrada(s)" in x for x in r["ressalva_reasons"])
    assert r["per_mppt"][0]["limits"]["max_strings_by_imax"] == 99


def test_zeroed_current_without_inputs_limit_says_so():
    r = validate(inv([(0, 0), (32, 48)], lin_max=(0.0, 2.0)), BOTH)
    assert any("sem limite de entradas informado" in x for x in r["ressalva_reasons"])


def test_rejected_kit_stays_rejected():
    # excede o overload do inversor (p_max_cc = 30 kW): Reprovado nao pode virar Verificar
    r = validate(inv([(32, 48)], p_max_cc=30000.0), BOTH)
    assert r["overall_badge"] == "Reprovado"
    assert r["mppts_sem_dados"] == [1]


def test_suggestions_with_zeroed_current_carry_the_remark():
    i = inv([(0, 0), (0, 0)])
    sugestoes = suggest_kit([MOD], [i], 0, 60, target_kwp=44.0, adjustments_by_inverter_id={1: ADJ})
    assert sugestoes, "deveria sugerir kits com a corrente zerada (limite ignorado)"
    for s in sugestoes:
        assert s.validation.overall_badge == "Aprovado com ressalva"
        assert any("limite de corrente foi ignorado" in x for x in s.ressalva_reasons)


def test_suggestions_never_use_an_mppt_without_current_row():
    i = inv([(32, 48)])  # 2o MPPT sem dados
    sugestoes = suggest_kit([MOD], [i], 0, 60, target_kwp=22.0, adjustments_by_inverter_id={1: ADJ})
    for s in sugestoes:
        assert all(c.mppt_idx == 0 for c in s.mppt_config)
