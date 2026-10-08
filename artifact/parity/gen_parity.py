"""Gera casos de paridade: roda o motor PYTHON (referencia) sobre muitos kits e
grava entradas + saidas esperadas para o comparador em Node (parity.test.js).

Uso (raiz do repositorio, depois de `export_data.py`):

    $env:PYTHONPATH = "backend"
    backend/.venv/Scripts/python.exe artifact/parity/gen_parity.py
    node artifact/parity/parity.test.js
"""
import dataclasses
import json
import os
import pathlib
import random
import shutil
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DATA = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "artifact" / "data.json")
REAL_DB = sys.argv[2] if len(sys.argv) > 2 else str(ROOT / "backend" / "data" / "fotus.db")
OUT = sys.argv[3] if len(sys.argv) > 3 else str(ROOT / "artifact" / "parity" / "cases.json")
COPY_DB = os.path.join(tempfile.mkdtemp(), "parity.db")
shutil.copy(REAL_DB, COPY_DB)
os.environ["FOTUS_DB_PATH"] = COPY_DB

from app.api.routes_dimensionamento import build_validation_response  # noqa: E402
from app.domain.calculo_solar.area import compare_modules_area  # noqa: E402
from app.domain.calculo_solar.auto_config import auto_config_strings  # noqa: E402
from app.domain.calculo_solar.calc_adjustments import CalcAdjustments, build_adjusted_inverter  # noqa: E402
from app.domain.calculo_solar.conditional_rules import apply_rules, kit_context, rule_from_dict  # noqa: E402
from app.domain.calculo_solar.mppt_limits import calculate_mppt_limits  # noqa: E402
from app.domain.calculo_solar.suggestion import suggest_kit  # noqa: E402
from app.domain.calculo_solar.validate_kit import MpptConfigInput  # noqa: E402
from app.domain.catalogo.inverter import Inverter, MpptCurrents  # noqa: E402
from app.domain.catalogo.module import Module  # noqa: E402
from app.domain.errors import ToolError  # noqa: E402

data = json.load(open(DATA, encoding="utf-8"))
modules = [Module(**m) for m in data["modules"]]
inverters = [Inverter(**{**i, "mppt_currents": [MpptCurrents(**c) for c in i["mppt_currents"]]}) for i in data["inverters"]]
mod_by_id = {m.module_id: m for m in modules}
inv_by_id = {i.inverter_id: i for i in inverters}

TEMPLATE_RULE = {
    "id": "t1", "name": "Sobrecarga estendida", "enabled": True, "inverter_ids": None,
    "conditions": [{"metric": "overload_pct", "op": ">", "value": 50}],
    "effects": [{"target": "overload_limit_pct", "mode": "set", "value": 60}, {"target": "v_max", "mode": "percent", "value": -15}],
}
KWP_RULE = {
    "id": "t2", "name": "Faixa kWp", "enabled": True, "inverter_ids": None,
    "conditions": [{"metric": "total_kwp", "op": ">=", "value": 20}, {"metric": "total_kwp", "op": "<=", "value": 80}],
    "effects": [{"target": "imax", "mode": "delta", "value": 3}, {"target": "v_mpp_max", "mode": "percent", "value": -5}],
}
ADJ_SETS = {
    "padrao_producao": data["adjustments"]["default"],
    "sem_ajuste": {"overload_pct_override": None, "imax_tolerance_a": 0, "isc_tolerance_a": 0, "vmax_delta_v": 0,
                   "vmpp_min_delta_v": 0, "vmpp_max_delta_v": 0, "dc_ac_ratio_min_pct_override": None, "rules": []},
    "estaticos": {"overload_pct_override": 70, "imax_tolerance_a": 2, "isc_tolerance_a": 1.5, "vmax_delta_v": -50,
                  "vmpp_min_delta_v": -20, "vmpp_max_delta_v": 30, "dc_ac_ratio_min_pct_override": 60, "rules": []},
    "regra_modelo": {"overload_pct_override": None, "imax_tolerance_a": 2, "isc_tolerance_a": 0, "vmax_delta_v": 0,
                     "vmpp_min_delta_v": 0, "vmpp_max_delta_v": 0, "dc_ac_ratio_min_pct_override": None, "rules": [TEMPLATE_RULE]},
    "regras_mistas": {"overload_pct_override": 0, "imax_tolerance_a": 0, "isc_tolerance_a": 0, "vmax_delta_v": 0,
                      "vmpp_min_delta_v": 0, "vmpp_max_delta_v": 0, "dc_ac_ratio_min_pct_override": 80, "rules": [TEMPLATE_RULE, KWP_RULE]},
}


def to_adj(d):
    return CalcAdjustments(**{**d, "rules": tuple(rule_from_dict(r) for r in d["rules"])})


rng = random.Random(20260928)
cases = {"validate": [], "limits": [], "auto": [], "suggest": [], "area": None}
regions = [(0, 60), (-8, 68), (0, 70), (5, 73), (12, 78), (15, 73)]

for n in range(900):
    inv = rng.choice(inverters)
    mod = rng.choice(modules)
    t_min, t_max = rng.choice(regions)
    adj_name = rng.choice(list(ADJ_SETS))
    adj = ADJ_SETS[adj_name]
    cfg = []
    for i in range(inv.num_mppt):
        if rng.random() < 0.15:
            cfg.append(None)
            continue
        try:
            lim = calculate_mppt_limits(inv, mod, t_min, t_max, i)
            series = rng.randint(max(1, lim.min_series - 1), max(1, lim.max_series + 1))
            strings = rng.randint(1, max(1, int(lim.max_strings) + 1))
        except ToolError:
            series, strings = rng.randint(1, 20), rng.randint(1, 3)
        cfg.append({"series": series, "strings": strings})
    py_cfg = [MpptConfigInput(**c) if c else None for c in cfg]
    try:
        exp = build_validation_response(inv, mod, t_min, t_max, py_cfg, to_adj(adj))
        exp = json.loads(json.dumps(exp, default=lambda o: dataclasses.asdict(o) if dataclasses.is_dataclass(o) else str(o)))
        exp_err = None
    except ToolError as e:
        exp, exp_err = None, e.code
    cases["validate"].append({"inv": inv.inverter_id, "mod": mod.module_id, "t": [t_min, t_max], "cfg": cfg, "adj": adj, "expected": exp, "error": exp_err})

    if n < 500:
        idx = rng.randint(0, inv.num_mppt)  # inclui indice fora do range
        total_kwp = rng.choice([None, rng.uniform(0, 300)])
        a = to_adj(adj)
        try:
            adjusted = build_adjusted_inverter(inv, a)
            applied = []
            if total_kwp is not None:
                adjusted, applied = apply_rules(adjusted, a.rules, kit_context(total_kwp * 1000, inv.p_nom))
            lim = calculate_mppt_limits(adjusted, mod, t_min, t_max, idx)
            exp_l = {**vars(lim), "effective_v_max": adjusted.v_max, "applied_rules": [vars(x) for x in applied]}
            err = None
        except ToolError as e:
            exp_l, err = None, e.code
        cases["limits"].append({"inv": inv.inverter_id, "mod": mod.module_id, "t": [t_min, t_max], "idx": idx, "total_kwp": total_kwp, "adj": adj, "expected": exp_l, "error": err})

    if n < 300:
        try:
            exp_a = [vars(c) for c in auto_config_strings(build_adjusted_inverter(inv, to_adj(adj)), mod, t_min, t_max)]
            err = None
        except ToolError as e:
            exp_a, err = None, e.code
        cases["auto"].append({"inv": inv.inverter_id, "mod": mod.module_id, "t": [t_min, t_max], "adj": adj, "expected": exp_a, "error": err})

# sugestoes: ajustes sinteticos por inversor para exercitar regras/estaticos
by_inv_json = {}
for inv in inverters:
    if inv.brand == "SOLPLANET":
        by_inv_json[str(inv.inverter_id)] = ADJ_SETS["regra_modelo"]
    elif inv.brand == "SOLIS":
        by_inv_json[str(inv.inverter_id)] = ADJ_SETS["estaticos"]
    elif inv.brand == "GOODWE":
        by_inv_json[str(inv.inverter_id)] = ADJ_SETS["regras_mistas"]
by_inv_py = {int(k): to_adj(v) for k, v in by_inv_json.items()}
default_adj = ADJ_SETS["padrao_producao"]
param_sets = [
    {"target_kwp": 10, "t": [0, 60]},
    {"target_kwp": 30, "t": [0, 60]},
    {"target_kwp": 165, "t": [0, 60], "inverter_brand": "SOLPLANET"},
    {"target_kwp": 55, "t": [5, 73], "module_brand": "TRINA"},
    {"target_inverter_kw": 10, "t": [0, 60]},
    {"target_inverter_kw": 110, "t": [0, 60], "max_suggestions": 40},
    {"target_kwp": 20, "t": [-8, 68], "inverter_phase": "Monofásico", "max_suggestions": 25},
    {"target_kwp": 80, "t": [12, 78], "inverter_min_kw": 30, "inverter_max_kw": 60},
]
for ps in param_sets:
    kw = {k: v for k, v in ps.items() if k != "t"}
    res = suggest_kit(modules, inverters, ps["t"][0], ps["t"][1], adjustments_by_inverter_id=by_inv_py, **kw)
    # a funcao Python usa CalcAdjustments() padrao para quem nao tem entrada; igualamos ao default de producao
    out = []
    for s in res:
        val = vars(s.validation).copy()
        val["per_mppt"] = [{**vars(p), "limits": vars(p.limits)} for p in s.validation.per_mppt]
        val["ressalva_reasons"] = s.ressalva_reasons
        val["applied_rules"] = [vars(a) for a in s.applied_rules]
        out.append({"module_id": s.module_id, "inverter_id": s.inverter_id, "mppt_config": [vars(c) for c in s.mppt_config], "validation": val, "score": s.score})
    cases["suggest"].append({"params": ps, "expected": out})
cases["suggest_adjustments"] = {"by_inverter": by_inv_json, "default": ADJ_SETS["sem_ajuste"]}

ids = [m.module_id for m in modules[:40]]
cases["area"] = {"ids": ids, "target_kwp": 12.5, "area_util_m2": 77.7,
                 "expected": [vars(r) for r in compare_modules_area([mod_by_id[i] for i in ids], target_kwp=12.5, area_util_m2=77.7)]}

json.dump(cases, open(OUT, "w"), default=lambda o: dataclasses.asdict(o) if dataclasses.is_dataclass(o) else str(o))
print({k: (len(v) if isinstance(v, list) else "ok") for k, v in cases.items()})
print("sugestoes por conjunto:", [len(c["expected"]) for c in cases["suggest"]])
