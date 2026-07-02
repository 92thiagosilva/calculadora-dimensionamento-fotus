"""Erros estruturados do dominio de dimensionamento solar.

Portado de fotus-dimens (TypeScript) `src/domain/errors.ts` — mesmos
codigos, mesma semantica. Sem stacktrace vazado ao cliente da API.
"""

from __future__ import annotations

from typing import Literal, Optional

ErrorCode = Literal[
    "CATALOG_ITEM_NOT_FOUND",
    "INVALID_THERMAL_RANGE",
    "MPPT_INDEX_OUT_OF_RANGE",
    "INVALID_INPUT_RANGE",
    "CALCULATION_NUMERIC_ERROR",
    "CITY_NOT_FOUND",
    "MICROINVERTER_WARNING",
    "BRAND_NOT_FOUND",
    "MISMATCH_MODULE_NOT_FOUND",
]


class ToolError(Exception):
    """Excecao de dominio carregando um codigo de erro estruturado.

    Equivalente a `ToolErrorException` do projeto TS de origem.
    """

    def __init__(self, code: ErrorCode, message: str, detail: Optional[str] = None) -> None:
        super().__init__(message)
        self.code: ErrorCode = code
        self.message = message
        self.detail = detail

    def to_dict(self) -> dict:
        out = {"code": self.code, "message": self.message}
        if self.detail is not None:
            out["detail"] = self.detail
        return out
