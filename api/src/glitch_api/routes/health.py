"""``GET /health`` (alias ``/healthz``) — liveness + which provider/model is configured.

Never touches the provider. ``/health`` is the canonical path: Cloud Run's front end
reserves ``/healthz`` and answers it with its own 404, so it never reaches the app there.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from glitch_api import __version__
from glitch_api.config import Settings, app_settings
from glitch_api.envelope import ok

router = APIRouter()


@router.get("/health")
@router.get("/healthz")
async def healthz(settings: Settings = Depends(app_settings)) -> JSONResponse:
    data = {
        "status": "ok",
        "provider": settings.resolved_provider,
        "model": settings.primary_model,
        "env": settings.env,
        "version": __version__,
    }
    if settings.uses_openrouter_backup:
        data["backup"] = {"provider": "openrouter", "model": settings.openrouter_model}
    return ok(data)
