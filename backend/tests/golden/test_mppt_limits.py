import pytest

from app.domain.calculo_solar.mppt_limits import calculate_mppt_limits
from app.domain.errors import ToolError
from tests.conftest import assert_close, list_fixtures, load_fixture, to_ns


@pytest.mark.parametrize("name", list_fixtures("mppt-limits"))
def test_mppt_limits_golden(name: str) -> None:
    fx = load_fixture("mppt-limits", name)
    inv = to_ns(fx["inputs"]["inv"])
    mod = to_ns(fx["inputs"]["mod"])
    outputs = fx["outputs"]

    if "error" in outputs:
        with pytest.raises(ToolError) as exc_info:
            calculate_mppt_limits(inv, mod, fx["inputs"]["tMin"], fx["inputs"]["tMax"], fx["inputs"]["mpptIdx"])
        assert exc_info.value.code == outputs["error"]
        return

    result = calculate_mppt_limits(inv, mod, fx["inputs"]["tMin"], fx["inputs"]["tMax"], fx["inputs"]["mpptIdx"])
    assert_close(result, outputs)
