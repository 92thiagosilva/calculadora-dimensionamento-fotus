import pytest

from app.domain.calculo_solar.validate_kit import MpptConfigInput, validate_kit
from tests.conftest import assert_close, list_fixtures, load_fixture, to_ns


@pytest.mark.parametrize("name", list_fixtures("validate-kit"))
def test_validate_kit_golden(name: str) -> None:
    fx = load_fixture("validate-kit", name)
    inv = to_ns(fx["inputs"]["inv"])
    mod = to_ns(fx["inputs"]["mod"])
    cfg = [
        MpptConfigInput(series=c["series"], strings=c["strings"]) if c is not None else None
        for c in fx["inputs"]["cfg"]
    ]
    result = validate_kit(inv, mod, fx["inputs"]["tMin"], fx["inputs"]["tMax"], cfg)
    assert_close(result, fx["outputs"])
