"""Structured JSON logs (structlog) to stdout + optional file, and the request logger.

Request lines carry route template, method, status, latency_ms, request_id, device_hash
and outcome. Bodies, query strings, headers, raw device ids and keys are never logged.
"""

from __future__ import annotations

import json
import logging as std_logging
import sys
import time
import uuid
from pathlib import Path
from typing import IO, Any

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from glitch_api.device import DEVICE_HEADER, try_device_hash
from glitch_api.envelope import ApiError
from glitch_api.metrics import get_metrics

_LOGGER_NAME = "glitch_api"
_open_files: list[IO[str]] = []


class _TeeLogger:
    """Writes each rendered JSON line to stdout (looked up at call time) and to open files."""

    def __init__(self, files: list[IO[str]]) -> None:
        self._files = files

    def msg(self, message: str) -> None:
        stdout = sys.stdout
        stdout.write(message + "\n")
        stdout.flush()
        for f in self._files:
            f.write(message + "\n")
            f.flush()

    debug = info = warning = warn = error = critical = exception = fatal = msg


_SEVERITY = {"warn": "WARNING", "exception": "ERROR", "fatal": "CRITICAL"}


def _add_severity(_: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    # Cloud Logging reads ``severity`` from JSON lines.
    event_dict["severity"] = _SEVERITY.get(method_name, method_name.upper())
    return event_dict


def configure_logging(level: str = "INFO", log_file: str | None = None) -> None:
    """(Re)configure structlog. Safe to call repeatedly (tests, app factory)."""
    for f in _open_files:
        try:
            f.close()
        except OSError:
            pass
    _open_files.clear()
    if log_file:
        path = Path(log_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        _open_files.append(path.open("a", encoding="utf-8"))

    files = list(_open_files)
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="ts"),
            _add_severity,
            structlog.processors.JSONRenderer(serializer=lambda obj, **kw: json.dumps(obj, default=str)),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(std_logging.getLevelName(level.upper())),
        logger_factory=lambda *args: _TeeLogger(files),
        cache_logger_on_first_use=False,
    )


def get_logger() -> Any:
    return structlog.get_logger(_LOGGER_NAME)


def _route_template(scope: Scope) -> str:
    route = scope.get("route")
    template = getattr(route, "path_format", None) or getattr(route, "path", None)
    if template:
        return str(template)
    return "<unmatched>"


class RequestLogMiddleware:
    """Pure-ASGI middleware: one ``request`` log line + ``requests_total`` per HTTP request.

    Also the last line of defence for unhandled exceptions: renders the ``INTERNAL``
    envelope *inside* the CORS middleware so even 500s carry CORS headers.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        state = scope.setdefault("state", {})
        state["request_id"] = request_id = uuid.uuid4().hex
        status_holder = {"status": 500, "started": False}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                status_holder["started"] = True
            await send(message)

        error_type: str | None = None
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:  # noqa: BLE001 — must never leak a trace to the client
            error_type = type(exc).__name__
            state["outcome"] = "INTERNAL"
            if not status_holder["started"]:
                response = ApiError("INTERNAL").to_response()
                await response(scope, receive, send_wrapper)
        finally:
            get_metrics().record_request()
            status = int(status_holder["status"])
            headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
            fields: dict[str, Any] = {
                "request_id": request_id,
                "method": scope.get("method"),
                "route": _route_template(scope),
                "status": status,
                "latency_ms": round((time.perf_counter() - start) * 1000, 2),
                "device_hash": try_device_hash(headers.get(DEVICE_HEADER.lower())),
                "outcome": state.get("outcome") or ("ok" if status < 400 else "error"),
            }
            if error_type:
                fields["error_type"] = error_type
            log = get_logger()
            if status >= 500:
                log.error("request", **fields)
            else:
                log.info("request", **fields)
