import httpx

from glitch_api import __version__


async def test_healthz_returns_ok_envelope_with_fake_provider_when_no_key(client: httpx.AsyncClient) -> None:
    resp = await client.get("/healthz")

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    data = body["data"]
    assert data["status"] == "ok"
    assert data["provider"] == "fake"
    assert data["env"] == "dev"
    assert data["version"] == __version__
    assert isinstance(data["model"], str) and data["model"]


async def test_health_alias_serves_the_same_payload(client: httpx.AsyncClient) -> None:
    # /health is the canonical path: Cloud Run's front end swallows /healthz.
    health, healthz = (await client.get("/health")), (await client.get("/healthz"))

    assert health.status_code == 200
    assert health.json() == healthz.json()


async def test_healthz_reports_openrouter_and_configured_model_when_key_set(make_settings) -> None:
    from glitch_api.main import create_app

    app = create_app(make_settings(openrouter_api_key="test-placeholder", openrouter_model="vendor/model-x"))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        data = (await c.get("/healthz")).json()["data"]

    assert data["provider"] == "openrouter"
    assert data["model"] == "vendor/model-x"


async def test_healthz_never_includes_the_key(make_settings) -> None:
    from glitch_api.main import create_app

    secret = "sk-or-v1-DO-NOT-LEAK-0123456789"
    app = create_app(make_settings(openrouter_api_key=secret))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        resp = await c.get("/healthz")

    assert secret not in resp.text


async def test_metrics_returns_counter_snapshot(client: httpx.AsyncClient) -> None:
    await client.get("/healthz")
    resp = await client.get("/v1/metrics")

    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["requests_total"] >= 1
    assert data["llm_calls_total"] == 0
    assert data["cache_hit_rate"] == 0.0
    assert data["cap_rejections"] == {"device": 0, "global": 0}
    for key in ("since", "llm_calls_by_outcome", "prompt_tokens_total", "completion_tokens_total",
                "cache_hits", "cache_misses"):
        assert key in data

