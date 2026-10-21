"""Response envelope: ``{"ok": true, "data", "energy"?}`` / ``{"ok": false, "error", "energy"?}``.

Every response the API sends goes through ``ok()`` or ``ApiError``. Error messages are
fixed strings — never learner input, exception text or secrets.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

ErrorCode = Literal[
    "BAD_REQUEST",
    "BAD_DEVICE",
    "CAP_DEVICE",
    "CAP_GLOBAL",
    "AI_TIMEOUT",
    "AI_UNAVAILABLE",
    "AI_INVALID_OUTPUT",
    "MODERATED",
    "INTERNAL",
    "NO_CASE_FILE",
]

# code → (http status, retryable, default message)   — spec/api.md error table
ERROR_TABLE: dict[str, tuple[int, bool, str]] = {
    "BAD_REQUEST": (400, False, "Invalid request."),
    "BAD_DEVICE": (400, False, "Missing or invalid X-Glitch-Device header (UUID v4 expected)."),
    "CAP_DEVICE": (429, False, "This device has used all of today's AI energy."),
    "CAP_GLOBAL": (503, False, "The server-wide AI budget for today is spent."),
    "AI_TIMEOUT": (504, True, "The AI took too long to answer."),
    "AI_UNAVAILABLE": (502, True, "The AI is unavailable right now."),
    "AI_INVALID_OUTPUT": (502, True, "The AI answer could not be read."),
    "MODERATED": (502, True, "The AI answer was blocked by the safety filter."),
    "INTERNAL": (500, True, "Something went wrong on the server."),
    # First-play draw landed on the classic v3 case (or nothing is cached): play v3, no note.
    "NO_CASE_FILE": (404, False, "Play the classic case file."),
}


class Energy(BaseModel):
    """Device AI energy, rendered as ``{"remaining", "limit", "resetsAt"}``."""

    model_config = ConfigDict(populate_by_name=True)

    remaining: int
    limit: int
    resets_at: str = Field(alias="resetsAt")  # ISO-8601 UTC, e.g. "2026-10-20T00:00:00Z"

    def to_json(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True)


def _energy_json(energy: Energy | dict[str, Any] | None) -> dict[str, Any] | None:
    if energy is None:
        return None
    return energy.to_json() if isinstance(energy, Energy) else dict(energy)


def ok(data: Any, energy: Energy | dict[str, Any] | None = None, status_code: int = 200) -> JSONResponse:
    """Success envelope. ``data`` may be a dict or a pydantic model (dumped by alias)."""
    if isinstance(data, BaseModel):
        data = data.model_dump(by_alias=True, mode="json")
    body: dict[str, Any] = {"ok": True, "data": data}
    energy_json = _energy_json(energy)
    if energy_json is not None:
        body["energy"] = energy_json
    return JSONResponse(body, status_code=status_code)


class ApiError(Exception):
    """Raise anywhere in a request; the installed handler renders the error envelope."""

    def __init__(
        self,
        code: ErrorCode | str,
        http_status: int | None = None,
        message: str | None = None,
        retryable: bool | None = None,
        energy: Energy | dict[str, Any] | None = None,
    ) -> None:
        default_status, default_retryable, default_message = ERROR_TABLE.get(code, ERROR_TABLE["INTERNAL"])
        self.code = code
        self.http_status = http_status if http_status is not None else default_status
        self.message = message if message is not None else default_message
        self.retryable = retryable if retryable is not None else default_retryable
        self.energy = energy
        super().__init__(f"{code}: {self.message}")

    def body(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "ok": False,
            "error": {"code": self.code, "message": self.message, "retryable": self.retryable},
        }
        energy_json = _energy_json(self.energy)
        if energy_json is not None:
            out["energy"] = energy_json
        return out

    def to_response(self) -> JSONResponse:
        return JSONResponse(self.body(), status_code=self.http_status)


def _mark_outcome(request: Request, code: str) -> None:
    # Read by RequestLogMiddleware for the request log's ``outcome`` field.
    request.scope.setdefault("state", {})["outcome"] = code


async def _api_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    _mark_outcome(request, exc.code)
    return exc.to_response()


async def _validation_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never echo pydantic's error detail: it contains the learner's input.
    _mark_outcome(request, "BAD_REQUEST")
    return ApiError("BAD_REQUEST", message="Invalid request body.").to_response()


async def _http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    status = exc.status_code
    message = {404: "Not found.", 405: "Method not allowed."}.get(status, "Invalid request.")
    code = "BAD_REQUEST" if status < 500 else "INTERNAL"
    _mark_outcome(request, code)
    return ApiError(code, http_status=status, message=message, retryable=status >= 500).to_response()


async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    _mark_outcome(request, "INTERNAL")
    return ApiError("INTERNAL").to_response()


def install_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
