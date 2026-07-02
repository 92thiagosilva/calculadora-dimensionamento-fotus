from __future__ import annotations

import json
import math
from pathlib import Path
from types import SimpleNamespace
from typing import Any, List

import pytest

FIXTURES_DIR = Path(__file__).parent / "golden" / "fixtures" / "manual"


def load_fixture(subdir: str, name: str) -> dict:
    path = FIXTURES_DIR / subdir / f"{name}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_fixtures(subdir: str) -> List[str]:
    d = FIXTURES_DIR / subdir
    return sorted(p.stem for p in d.glob("*.json"))


def to_ns(d: dict) -> SimpleNamespace:
    """Converte dict (possivelmente aninhado) em SimpleNamespace recursivo,
    para que os objetos de dominio (que usam atributos, nao chaves de
    dict) aceitem os fixtures JSON diretamente."""
    if isinstance(d, dict):
        return SimpleNamespace(**{k: to_ns(v) for k, v in d.items()})
    if isinstance(d, list):
        return [to_ns(v) for v in d]
    return d


def assert_close(actual: Any, expected: Any, path: str = "") -> None:
    if isinstance(expected, dict):
        for k, v in expected.items():
            assert_close(actual[k] if isinstance(actual, dict) else getattr(actual, _snake(k)), v, f"{path}.{k}")
        return
    if isinstance(expected, list):
        assert len(actual) == len(expected), f"{path}: length mismatch"
        for i, v in enumerate(expected):
            assert_close(actual[i], v, f"{path}[{i}]")
        return
    if isinstance(expected, float):
        assert isinstance(actual, (int, float)), f"{path}: expected number, got {type(actual)}"
        assert math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9), (
            f"{path}: expected {expected!r}, got {actual!r}"
        )
        return
    assert actual == expected, f"{path}: expected {expected!r}, got {actual!r}"


def _snake(camel: str) -> str:
    out = []
    for ch in camel:
        if ch.isupper():
            out.append("_")
            out.append(ch.lower())
        else:
            out.append(ch)
    return "".join(out)
