"""Exporta o catalogo e os ajustes efetivos para o artefato (somente leitura,
sobre uma COPIA do banco). Nao exporta e-mails, usuarios autorizados nem auditoria.

Uso (a partir da raiz do repositorio; o repositorio e' publico, entao o
`data.json` gerado NAO deve ser versionado — ver artifact/.gitignore):

    $env:PYTHONPATH = "backend"
    backend/.venv/Scripts/python.exe artifact/export_data.py [banco.db] [saida.json]
"""
import datetime as dt
import json
import os
import pathlib
import shutil
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
REAL = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "backend" / "data" / "fotus.db")
OUT = sys.argv[2] if len(sys.argv) > 2 else str(ROOT / "artifact" / "data.json")
COPY = os.path.join(tempfile.mkdtemp(), "export.db")
shutil.copy(REAL, COPY)
os.environ["FOTUS_DB_PATH"] = COPY

from app.domain.calculo_solar.conditional_rules import rule_to_dict  # noqa: E402
from app.domain.catalogo.thermal_region import THERMAL_REGIONS  # noqa: E402
from app.infra import repository  # noqa: E402
from app.infra.db import SessionLocal  # noqa: E402

db = SessionLocal()
modules = [vars(m) for m in repository.list_modules(db)]
inverters = []
for i in repository.list_inverters(db):
    d = vars(i).copy()
    d["mppt_currents"] = [vars(c) for c in i.mppt_currents]
    inverters.append(d)

effective = repository.get_all_effective_adjustments(db)


def adj_dict(a):
    d = {k: v for k, v in vars(a).items() if k != "rules"}
    d["rules"] = [rule_to_dict(r) for r in a.rules]
    return d


# o mais comum vira o "padrao"; so guarda por inversor o que difere
from collections import Counter  # noqa: E402

as_json = {iid: json.dumps(adj_dict(a), sort_keys=True) for iid, a in effective.items()}
default_json, _ = Counter(as_json.values()).most_common(1)[0]
by_inverter = {str(iid): json.loads(j) for iid, j in as_json.items() if j != default_json}

g = repository.get_or_create_global_calc_settings(db)
data = {
    "geradoEm": dt.datetime.now().strftime("%d/%m/%Y %H:%M"),
    "fonte": "Planilha '2026 - Dimensionamento Módulo x Inversor - JUNHO 2' (aba BD)",
    "modules": modules,
    "inverters": inverters,
    "regions": [vars(r) for r in THERMAL_REGIONS],
    "adjustments": {"default": json.loads(default_json), "byInverter": by_inverter},
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print(f"modulos={len(modules)} inversores={len(inverters)} ajustes especificos={len(by_inverter)} padrao={default_json[:200]}")
print("tamanho:", os.path.getsize(OUT), "bytes")
