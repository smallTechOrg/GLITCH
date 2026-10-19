import json

import httpx
from fastapi import APIRouter

from glitch_api.envelope import ApiError, Energy, ok
from glitch_api.main import create_app

ENERGY = Energy(remaining=9, limit=10, resetsAt="2026-10-20T00:00:00Z")


def _body(resp) -> dict:
    return json.loads(resp.body)


def test_ok_renders_data_without_energy() -> None:
    resp = ok({"a": 1})

    assert resp.status_code == 200
    assert _body(resp) == {"ok": True, "data": {"a": 1}}


def test_ok_renders_energy_with_camel_case_resets_at() -> None:
    body = _body(ok({}, energy=ENERGY))

    assert body["energy"] == {"remaining": 9, "limit": 10, "resetsAt": "2026-10-20T00:00:00Z"}


def test_api_error_defaults_follow_the_error_table() -> None:
    table = {
        "BAD_REQUEST": (400, False), "BAD_DEVICE": (400, False), "CAP_DEVICE": (429, False),
        "CAP_GLOBAL": (503, False), "AI_TIMEOUT": (504, True), "AI_UNAVAILABLE": (502, True),
        "AI_INVALID_OUTPUT": (502, True), "MODERATED": (502, True), "INTERNAL": (500, True),
    }
    for code, (status, retryable) in table.items():
        err = ApiError(code)
        assert (err.http_status, err.retryable) == (status, retryable), code
        assert err.message


def test_api_error_response_shape_includes_energy_when_given() -> None:
    err = ApiError("CAP_DEVICE", message="Battery flat.", energy=ENERGY)
    resp = err.to_response()

    assert resp.status_code == 429
    assert _body(resp) == {
        "ok": False,
        "error": {"code": "CAP_DEVICE", "message": "Battery flat.", "retryable": False},
        "energy": {"remaining": 9, "limit": 10, "resetsAt": "2026-10-20T00:00:00Z"},
    }


async def _client_with_extra_routes(settings):
    router = APIRouter()

    @router.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret learner text inside an exception")

    @router.get("/raise-api-error")
    async def raise_api_error() -> None:
        raise ApiError("MODERATED")

    @router.post("/needs-body")
    async def needs_body(payload: dict[str, int]) -> dict:
        return payload

    app = create_app(settings)
    app.include_router(router)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t")


async def test_unhandled_exception_becomes_internal_envelope_without_trace(settings) -> None:
    async with await _client_with_extra_routes(settings) as c:
        resp = await c.get("/boom")

    assert resp.status_code == 500
    assert resp.json() == {"ok": False, "error": {"code": "INTERNAL", "message": resp.json()["error"]["message"], "retryable": True}}
    assert "secret learner text" not in resp.text
    assert "Traceback" not in resp.text


async def test_raised_api_error_is_rendered_by_the_handler(settings) -> None:
    async with await _client_with_extra_routes(settings) as c:
        resp = await c.get("/raise-api-error")

    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "MODERATED"


async def test_validation_error_becomes_bad_request_without_echoing_input(settings) -> None:
    async with await _client_with_extra_routes(settings) as c:
        resp = await c.post("/needs-body", json={"x": "LEARNER-SENTINEL-TEXT"})

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "BAD_REQUEST"
    assert "LEARNER-SENTINEL-TEXT" not in resp.text


async def test_unknown_route_returns_error_envelope(client) -> None:
    resp = await client.get("/nope")

    assert resp.status_code == 404
    body = resp.json()
    assert body["ok"] is False
    assert body["error"]["retryable"] is False
