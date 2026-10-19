"""Run command: ``cd api && uv run python -m glitch_api`` → http://127.0.0.1:8787."""

from __future__ import annotations

import sys

import uvicorn

from glitch_api.config import ConfigError, get_settings
from glitch_api.main import create_app


def main() -> int:
    settings = get_settings()
    try:
        app = create_app(settings)
    except ConfigError as exc:
        print(f"GLITCH API config error: {exc}", file=sys.stderr)
        return 1
    # Our RequestLogMiddleware writes the structured access log; uvicorn's is disabled.
    uvicorn.run(app, host=settings.host, port=settings.port, access_log=False, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
