"""Decisao Fotus (2026-11-24): a tensao minima do modulo (`vmp_min`) usa o
coeficiente de TENSAO (`coef_v`), nao o de potencia (`coef_pmp`). Estes testes
protegem a decisao: nenhuma fixture golden muda o numero minimo de modulos,
entao sem eles uma volta ao `coef_pmp` passaria despercebida em varios kits."""

from __future__ import annotations

import math
from types import SimpleNamespace

import pytest

from app.domain.calculo_solar.corrections import apply_module_corrections
from app.domain.calculo_solar.mppt_limits import calculate_mppt_limits

# Valores reais do catalogo: RENESOLA RS6-585NG-E3 e SOLPLANET ASW 40K-LT-G3 (3 MPPT).
MOD = dict(voc=52.6, vmp=44.25, imp=13.22, isc=13.9, coef_v=-0.25, coef_pmp=-0.29, coef_i=0.045)
INV = SimpleNamespace(
    mppt_currents=[SimpleNamespace(imax=32.0, isc=48.0)] * 3,
    lin_max=[2.0, 2.0, 2.0],
    v_max=1100.0,
    v_mpp_min=200.0,
    v_mpp_max=1000.0,
    num_mppt=3,
)


def test_vmp_min_uses_voltage_coefficient():
    corr = apply_module_corrections(SimpleNamespace(**MOD), t_min=0, t_max=60)
    assert corr.vmp_min == pytest.approx(MOD["vmp"] * (1 + (60 - 25) * MOD["coef_v"] / 100))
    assert corr.vmp_min != pytest.approx(MOD["vmp"] * (1 + (60 - 25) * MOD["coef_pmp"] / 100))


def test_power_coefficient_is_not_needed_for_corrections():
    sem_pmp = {k: v for k, v in MOD.items() if k != "coef_pmp"}
    corr = apply_module_corrections(SimpleNamespace(**sem_pmp), t_min=0, t_max=60)
    assert corr.vmp_min == pytest.approx(40.378125)


def test_changing_only_coef_pmp_changes_nothing():
    base = apply_module_corrections(SimpleNamespace(**MOD), 0, 60)
    other = apply_module_corrections(SimpleNamespace(**{**MOD, "coef_pmp": -0.9}), 0, 60)
    assert base == other


def test_minimum_modules_per_string_follows_the_voltage_coefficient():
    lim = calculate_mppt_limits(INV, SimpleNamespace(**MOD), 0, 60, 0)
    assert lim.min_series == math.ceil(200.0 / 40.378125) == 5
    # com o coeficiente de potencia seriam 6 (o resultado antes da decisao)
    vmp_min_pmp = MOD["vmp"] * (1 + (60 - 25) * MOD["coef_pmp"] / 100)
    assert math.ceil(200.0 / vmp_min_pmp) == 6


def test_other_corrections_are_unchanged():
    corr = apply_module_corrections(SimpleNamespace(**MOD), 0, 60)
    assert corr.voc_max == pytest.approx(MOD["voc"] * (1 + (0 - 25) * MOD["coef_v"] / 100))
    assert corr.imp_max == pytest.approx(MOD["imp"] * (1 + (60 - 25) * MOD["coef_i"] / 100))
    assert corr.isc_max == pytest.approx(MOD["isc"] * (1 + (60 - 25) * MOD["coef_i"] / 100))
