import pytest

from app.domain.calculo_solar.auto_config import auto_config_strings
from tests.conftest import assert_close, list_fixtures, load_fixture, to_ns


@pytest.mark.parametrize("name", list_fixtures("auto-config"))
def test_auto_config_golden(name: str) -> None:
    fx = load_fixture("auto-config", name)
    inv = to_ns(fx["inputs"]["inv"])
    mod = to_ns(fx["inputs"]["mod"])
    result = auto_config_strings(inv, mod, fx["inputs"]["tMin"], fx["inputs"]["tMax"])
    assert_close(result, fx["outputs"]["mpptConfig"])
