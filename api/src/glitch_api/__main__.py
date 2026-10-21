"""Run command: ``cd api && uv run python -m glitch_api`` → http://127.0.0.1:8787."""

from __future__ import annotations

import sys

import uvicorn
from pydantic import ValidationError

from glitch_api.config import ConfigError, Settings, get_settings
from glitch_api.main import create_app


def describe_validation_error(exc: ValidationError) -> str:
    """One line naming each bad ``GLITCH_*`` variable. Never includes the input values
    (they may be secrets): only the field name and pydantic's expectation text."""
    parts: list[str] = []
    for err in exc.errors(include_url=False, include_input=False, include_context=False):
        loc = err.get("loc") or ()
        name = f"GLITCH_{str(loc[0]).upper()}" if loc else "settings"
        # value_error messages can quote the raw input (e.g. int('...')); keep them generic.
        msg = "invalid value" if str(err.get("type", "")).startswith("value_error") else str(err.get("msg", "invalid"))
        parts.append(f"{name}: {msg}")
    return "; ".join(parts) + " — fix it in .env"


def main() -> int:
    try:
        settings: Settings = get_settings()
        app = create_app(settings)
    except ValidationError as exc:
        print(f"GLITCH API config error: {describe_validation_error(exc)}", file=sys.stderr)
        return 1
    except ConfigError as exc:
        print(f"GLITCH API config error: {exc}", file=sys.stderr)
        return 1
    # Our RequestLogMiddleware writes the structured access log; uvicorn's is disabled.
    uvicorn.run(app, host=settings.host, port=settings.port, access_log=False, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
