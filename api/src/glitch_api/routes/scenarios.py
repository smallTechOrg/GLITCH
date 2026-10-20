"""``GET /v1/scenarios/{gameId}/next?seen=<comma ids>`` — next unseen case file (spec/api.md).

Order: device header (``BAD_DEVICE``) → game id / ``seen`` (``BAD_REQUEST``, with energy) →
``run_scenario``: a cached variation not in ``seen`` (free) or ONE generation (1 device
energy + 1 global unit per provider call). Any failure is an ``ok:false`` envelope with the
device's energy; the client then plays the v3 case file. ``seen`` ids are only compared,
never stored or logged.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from glitch_api.caps.budget import energy_service_for
from glitch_api.device import Device, require_device
from glitch_api.envelope import ApiError, ok
from glitch_api.llm.factory import provider_for
from glitch_api.scenarios import repository_for
from glitch_api.scenarios.pipeline import ScenarioOptions, run_scenario
from glitch_api.scenarios.schemas import GAME_IDS

router = APIRouter()

MAX_SEEN = 200
_SEEN_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
BAD_GAME_MESSAGE = f"Unknown content game: use one of {', '.join(GAME_IDS)}."
BAD_SEEN_MESSAGE = f"Invalid seen list: up to {MAX_SEEN} comma-separated variation ids."


def parse_seen(raw: str | None) -> frozenset[str]:
    if raw is None:
        return frozenset()
    ids = [part.strip() for part in raw.split(",") if part.strip()]
    if len(ids) > MAX_SEEN or not all(_SEEN_ID.match(i) for i in ids):
        raise ValueError("bad seen list")
    return frozenset(ids)


def options_for(request: Request) -> ScenarioOptions:
    preset = getattr(request.app.state, "scenario_options", None)
    if isinstance(preset, ScenarioOptions):
        return preset
    settings = request.app.state.settings
    return ScenarioOptions(
        max_tokens=settings.llm_max_output_tokens,
        timeout_s=settings.llm_timeout_s,
        deadline_s=settings.llm_timeout_s,
    )


@router.get("/v1/scenarios/{game_id}/next")
async def next_scenario(game_id: str, request: Request, device: Device = Depends(require_device)) -> JSONResponse:
    energy = energy_service_for(request.app)
    if game_id not in GAME_IDS:
        raise ApiError("BAD_REQUEST", message=BAD_GAME_MESSAGE, energy=await energy.energy(device.hash))
    try:
        seen = parse_seen(request.query_params.get("seen"))
    except ValueError:
        raise ApiError("BAD_REQUEST", message=BAD_SEEN_MESSAGE, energy=await energy.energy(device.hash)) from None

    provider = provider_for(request.app)
    state = await run_scenario(
        game_id,
        seen,
        device.hash,
        provider=provider,
        repo=repository_for(request.app, provider),
        energy=energy,
        options=options_for(request),
        request_id=request.scope.get("state", {}).get("request_id"),
    )
    if state.error is not None:
        raise state.error
    assert state.result is not None
    return ok(state.result.to_json(), energy=state.energy)
