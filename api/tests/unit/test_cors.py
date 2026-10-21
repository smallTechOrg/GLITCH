import httpx
import pytest

ALLOWED = [
    "http://127.0.0.1:8090", "http://localhost:8090",
    "http://127.0.0.1:8092", "http://localhost:8092",
    "https://smalltechorg.github.io",
]


@pytest.mark.parametrize("origin", ALLOWED)
async def test_cors_preflight_allows_each_configured_origin(client: httpx.AsyncClient, origin: str) -> None:
    resp = await client.options(
        "/v1/freewrite/evaluate",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-glitch-device",
        },
    )

    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == origin
    allowed_headers = resp.headers["access-control-allow-headers"].lower()
    assert "x-glitch-device" in allowed_headers
    assert "content-type" in allowed_headers
    assert "POST" in resp.headers["access-control-allow-methods"]


async def test_cors_simple_get_echoes_allowed_origin(client: httpx.AsyncClient) -> None:
    resp = await client.get("/healthz", headers={"Origin": "http://127.0.0.1:8090"})

    assert resp.headers["access-control-allow-origin"] == "http://127.0.0.1:8090"


async def test_cors_rejects_unlisted_origin(client: httpx.AsyncClient) -> None:
    pre = await client.options(
        "/healthz", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}
    )
    get = await client.get("/healthz", headers={"Origin": "https://evil.example"})

    assert pre.status_code == 400
    assert "access-control-allow-origin" not in get.headers


async def test_cors_origins_are_configurable(make_settings) -> None:
    from glitch_api.main import create_app

    app = create_app(make_settings(cors_origins="https://only.example"))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        allowed = await c.get("/healthz", headers={"Origin": "https://only.example"})
        default_now_blocked = await c.get("/healthz", headers={"Origin": "http://127.0.0.1:8090"})

    assert allowed.headers["access-control-allow-origin"] == "https://only.example"
    assert "access-control-allow-origin" not in default_now_blocked.headers


async def test_cors_headers_present_on_error_envelopes(client: httpx.AsyncClient) -> None:
    resp = await client.get("/v1/energy", headers={"Origin": "http://127.0.0.1:8090", "X-Glitch-Device": "not-a-uuid"})

    assert resp.status_code == 400
    body = resp.json()
    assert body["ok"] is False
    assert body["error"]["code"] == "BAD_DEVICE"
    assert resp.headers["access-control-allow-origin"] == "http://127.0.0.1:8090"
