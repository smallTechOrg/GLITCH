"""App factory: ``create_app(settings=None)`` wires CORS, request logging, error handlers and routers."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from glitch_api import __version__
from glitch_api.config import Settings, get_settings
from glitch_api.device import DEVICE_HEADER
from glitch_api.envelope import install_handlers
from glitch_api.logging import RequestLogMiddleware, configure_logging
from glitch_api.routes import energy, freewrite, health, metrics, scenarios


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    settings.startup_check()
    configure_logging(settings.log_level, settings.log_file)

    app = FastAPI(
        title="GLITCH API",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings

    install_handlers(app)

    # Order matters: add_middleware wraps outward, so CORS is OUTSIDE the request logger.
    # Every response the logger renders (incl. INTERNAL 500s) therefore gets CORS headers.
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", DEVICE_HEADER],
        allow_credentials=False,
        max_age=600,
    )

    app.include_router(health.router)
    app.include_router(metrics.router)
    app.include_router(energy.router)
    app.include_router(freewrite.router)
    app.include_router(scenarios.router)
    return app
