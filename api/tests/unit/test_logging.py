import json
from pathlib import Path

import httpx

from glitch_api.main import create_app

SENTINEL_PROMPT = "LEARNER-PROMPT-SENTINEL-7f3a"
SENTINEL_GOAL = "LEARNER-GOAL-SENTINEL-91bc"


def _lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


async def _run(make_settings, tmp_path: Path, calls) -> Path:
    log_file = tmp_path / "logs" / "api.log"
    app = create_app(make_settings(log_file=str(log_file)))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        for method, path, kwargs in calls:
            await c.request(method, path, **kwargs)
    return log_file


async def test_request_log_line_has_route_latency_and_status(make_settings, tmp_path: Path) -> None:
    log_file = await _run(make_settings, tmp_path, [("GET", "/healthz", {})])

    requests = [line for line in _lines(log_file) if line["event"] == "request"]
    assert len(requests) == 1
    line = requests[0]
    assert line["route"] == "/healthz"
    assert line["method"] == "GET"
    assert line["status"] == 200
    assert isinstance(line["latency_ms"], (int, float)) and line["latency_ms"] >= 0
    assert line["request_id"]
    assert line["outcome"] == "ok"
    assert line["device_hash"] is None


async def test_request_log_never_contains_bodies_or_raw_device_id(
    make_settings, tmp_path: Path, device_id: str, capsys
) -> None:
    body = {"goalId": "fw1", "goal": SENTINEL_GOAL, "prompt": SENTINEL_PROMPT}
    log_file = await _run(
        make_settings,
        tmp_path,
        [("POST", "/v1/freewrite/evaluate", {"json": body, "headers": {"X-Glitch-Device": device_id}})],
    )

    file_text = log_file.read_text()
    stdout = capsys.readouterr().out
    for text in (file_text, stdout):
        assert SENTINEL_PROMPT not in text
        assert SENTINEL_GOAL not in text
        assert device_id not in text
    line = [entry for entry in _lines(log_file) if entry["event"] == "request"][0]
    assert line["route"] == "/v1/freewrite/evaluate"
    assert line["status"] == 200
    assert line["outcome"] == "ok"
    assert line["device_hash"] and len(line["device_hash"]) == 12


async def test_request_log_also_goes_to_stdout_as_json(make_settings, tmp_path: Path, capsys) -> None:
    await _run(make_settings, tmp_path, [("GET", "/v1/metrics", {})])

    out_lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    assert any(entry.get("event") == "request" and entry.get("route") == "/v1/metrics" for entry in out_lines)


async def test_request_log_uses_route_template_not_raw_query(make_settings, tmp_path: Path) -> None:
    log_file = await _run(make_settings, tmp_path, [("GET", "/healthz?prompt=" + SENTINEL_PROMPT, {})])

    assert SENTINEL_PROMPT not in log_file.read_text()


async def test_unhandled_error_log_has_type_but_not_message(make_settings, tmp_path: Path) -> None:
    from fastapi import APIRouter

    router = APIRouter()

    @router.get("/boom")
    async def boom() -> None:
        raise RuntimeError(SENTINEL_PROMPT)

    log_file = tmp_path / "api.log"
    app = create_app(make_settings(log_file=str(log_file)))
    app.include_router(router)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t"
    ) as c:
        resp = await c.get("/boom")

    assert resp.status_code == 500
    text = log_file.read_text()
    assert SENTINEL_PROMPT not in text
    assert "RuntimeError" in text
    line = [entry for entry in _lines(log_file) if entry["event"] == "request"][0]
    assert line["status"] == 500
    assert line["outcome"] == "INTERNAL"
