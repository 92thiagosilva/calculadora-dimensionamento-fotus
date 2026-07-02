import pytest

from app.domain.calculo_solar.corrections import apply_module_corrections
from tests.conftest import assert_close, list_fixtures, load_fixture, to_ns


@pytest.mark.parametrize("name", list_fixtures("corrections"))
def test_corrections_golden(name: str) -> None:
    fx = load_fixture("corrections", name)
    mod = to_ns(fx["inputs"]["mod"])
    result = apply_module_corrections(mod, fx["inputs"]["tMin"], fx["inputs"]["tMax"])
    assert_close(result, fx["outputs"])
