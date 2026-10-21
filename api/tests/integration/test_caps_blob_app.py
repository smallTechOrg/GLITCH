"""Durable caps through the real app (P2-D2): energy survives re-creating the app.

These tests restore the production selection (``blob_store_for`` = ``store.store_for``) that
``tests/conftest.py`` redirects, so the counters live under ``GLITCH_CACHE_DIR`` exactly as
on a running server.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from glitch_api.caps import blob_store as caps_blob_store
from glitch_api.caps.blob_store import BlobCounterStore
from glitch_api.device import device_hash
from glitch_api.store import store_for
from glitch_api.store.fake_gcs import FakeGcsClient
from glitch_api.store.gcs import GcsBlobStore
from glitch_api.store.local import LocalBlobStore
from tests.integration.conftest import body

EVAL = "/v1/freewrite/evaluate"


def _h(device_id: str) -> dict[str, str]:
    return {"X-Glitch-Device": device_id}


@pytest.fixture
def production_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(caps_blob_store, "blob_store_for", store_for)


async def test_energy_unchanged_after_recreating_the_app_on_the_same_store_dir(
    production_selection, fake_app, client_for, device_id, tmp_path: Path
) -> None:
    cache = tmp_path / "cache"
    first = fake_app(cache_dir=str(cache))
    async with client_for(first) as c:
        for expected in (9, 8, 7):
            resp = await c.post(EVAL, headers=_h(device_id), json=body())
            assert (
                resp.status_code == 200
                and resp.json()["energy"]["remaining"] == expected
            )
    assert isinstance(first.state.counter_store, BlobCounterStore)
    assert isinstance(first.state.counter_store.blob, LocalBlobStore)

    # "Restart": a brand-new app (new EnergyService, new stores) on the same directory.
    restarted = fake_app(cache_dir=str(cache))
    async with client_for(restarted) as c:
        energy = (await c.get("/v1/energy", headers=_h(device_id))).json()["energy"]
        assert energy == {
            "remaining": 7,
            "limit": 10,
            "resetsAt": "2026-10-20T00:00:00Z",
        }
        resp = await c.post(EVAL, headers=_h(device_id), json=body())
        assert resp.json()["energy"]["remaining"] == 6

    stored = (cache / "caps" / "2026-10-19.json").read_text()
    assert json.loads(stored) == {"devices": {device_hash(device_id): 4}, "global": 4}
    assert device_id not in stored  # hashed ids only


async def test_device_cap_persists_across_restart(
    production_selection, fake_app, client_for, device_id, tmp_path: Path
) -> None:
    cache = str(tmp_path / "cache")
    async with client_for(fake_app(cache_dir=cache, device_daily_cap=1)) as c:
        assert (
            await c.post(EVAL, headers=_h(device_id), json=body())
        ).status_code == 200
    async with client_for(fake_app(cache_dir=cache, device_daily_cap=1)) as c:
        resp = await c.post(EVAL, headers=_h(device_id), json=body())
    assert resp.json()["error"]["code"] == "CAP_DEVICE"
    assert resp.json()["energy"]["remaining"] == 0


async def test_gcs_backend_app_persists_through_the_bucket(
    production_selection, fake_app, client_for, device_id
) -> None:
    client = FakeGcsClient()

    def app_on_bucket():
        app = fake_app(blob_backend="gcs", gcs_bucket="glitch-test")
        app.state.blob_store = GcsBlobStore("glitch-test", client=client)
        return app

    async with client_for(app_on_bucket()) as c:
        for _ in range(3):
            assert (
                await c.post(EVAL, headers=_h(device_id), json=body())
            ).status_code == 200
    async with client_for(app_on_bucket()) as c:
        energy = (await c.get("/v1/energy", headers=_h(device_id))).json()["energy"]
    assert energy["remaining"] == 7
    assert (
        json.loads(client.buckets["glitch-test"]["caps/2026-10-19.json"].data)["global"]
        == 3
    )
