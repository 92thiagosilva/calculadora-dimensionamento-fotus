"""Mismatch: a tensao minima (`Vmp_min`) usa o coeficiente de TENSAO (`coef_v`),
decisao Fotus de 2026-11-24 (a planilha original usava `coef_pmp`)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.domain.calculo_solar.mismatch import MISMATCH_T_MAX, compute_mismatch


def mod(module_id: int, **kw) -> SimpleNamespace:
    base = dict(
        module_id=module_id, label=f"M{module_id}", pnom=550.0, isc=13.9, voc=50.0, imp=13.0, vmp=42.0,
        coef_v=-0.25, coef_i=0.045, coef_pmp=-0.30,
    )
    return SimpleNamespace(**{**base, **kw})


def test_vmp_min_uses_voltage_coefficient():
    original, sub = mod(1), mod(2)
    r = compute_mismatch(original, sub)
    esperado = 42.0 * (1 + (MISMATCH_T_MAX - 25) * -0.25 / 100)
    assert r.vmp_min_original == pytest.approx(esperado)
    assert r.vmp_min_substituto == pytest.approx(esperado)


def test_only_power_coefficient_differs_still_matches():
    # Mesmo Voc, Vmp, Imp e coeficientes de tensao/corrente; so o Coef Pmp muda muito.
    # Com a regra antiga o delta de Vmp_min seria ~20% (MISMATCH); com Coef V e' 0%.
    r = compute_mismatch(mod(1, coef_pmp=-0.30), mod(2, coef_pmp=-0.80))
    assert r.vmp_min_delta_pct == pytest.approx(0.0)
    assert r.veredito == "MATCH"
    antigo = abs(42.0 * (1 + 35 * -0.30 / 100) - 42.0 * (1 + 35 * -0.80 / 100)) / (42.0 * (1 + 35 * -0.30 / 100))
    assert antigo > 0.03


def test_different_voltage_coefficient_changes_vmp_min_and_verdict():
    r = compute_mismatch(mod(1, coef_v=-0.25), mod(2, coef_v=-0.45))
    assert r.vmp_min_delta_pct > 0.03
    assert r.veredito == "MISMATCH"


def test_parameter_table_still_compares_the_power_coefficient():
    r = compute_mismatch(mod(1, coef_pmp=-0.30), mod(2, coef_pmp=-0.80))
    linha = next(p for p in r.params if p.label.startswith("Coef Pmp"))
    assert linha.original == -0.30 and linha.substituto == -0.80
    # a planilha divide pelo valor do ORIGINAL (negativo para coeficientes), comportamento mantido
    assert linha.delta_pct == pytest.approx(abs(-0.30 - -0.80) / -0.30)
