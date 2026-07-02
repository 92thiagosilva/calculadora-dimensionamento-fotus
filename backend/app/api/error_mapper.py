from __future__ import annotations

from contextlib import contextmanager

from fastapi import HTTPException

from app.domain.errors import ToolError

_STATUS_BY_CODE = {
    "CATALOG_ITEM_NOT_FOUND": 404,
    "CITY_NOT_FOUND": 404,
    "MISMATCH_MODULE_NOT_FOUND": 404,
    "BRAND_NOT_FOUND": 404,
    "MPPT_INDEX_OUT_OF_RANGE": 400,
    "INVALID_INPUT_RANGE": 400,
    "INVALID_THERMAL_RANGE": 400,
    "CALCULATION_NUMERIC_ERROR": 422,
    "MICROINVERTER_WARNING": 200,
}


@contextmanager
def map_tool_errors():
    try:
        yield
    except ToolError as err:
        status = _STATUS_BY_CODE.get(err.code, 400)
        raise HTTPException(status_code=status, detail=err.to_dict()) from err
