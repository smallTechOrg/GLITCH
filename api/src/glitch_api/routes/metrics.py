"""``GET /v1/metrics`` — process counters (no learner data)."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from glitch_api.envelope import ok
from glitch_api.metrics import get_metrics

router = APIRouter()


@router.get("/v1/metrics")
async def metrics() -> JSONResponse:
    return ok(get_metrics().snapshot())
