"""``GET /healthz`` — liveness + which provider/model is configured. Never touches the provider."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from glitch_api import __version__
from glitch_api.config import Settings, app_settings
from glitch_api.envelope import ok
from glitch_api.llm.base import FAKE_MODEL_SLUG

router = APIRouter()


@router.get("/healthz")
async def healthz(settings: Settings = Depends(app_settings)) -> JSONResponse:
    provider = settings.resolved_provider
    model = settings.openrouter_model if provider == "openrouter" else FAKE_MODEL_SLUG
    return ok({"status": "ok", "provider": provider, "model": model, "env": settings.env, "version": __version__})
