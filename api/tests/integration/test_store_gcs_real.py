"""[gcs] Real bucket round-trip for the blob store and the scenario cache.

Needs ``GLITCH_GCS_BUCKET`` (repo-root .env or env) and Application Default Credentials.
Runs only with ``-m gcs``; without credentials it FAILS with PENDING-CREDS (never skips).
Everything is written under a unique ``glitch-test-<uuid>`` prefix removed on teardown.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest

from glitch_api.config import Settings
from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.repository import ScenarioRepository
from glitch_api.scenarios.schemas import parse_candidate
from glitch_api.store import AlreadyExists, PreconditionFailed, StoreError, update_json

pytestmark = pytest.mark.gcs

PENDING_CREDS = "PENDING-CREDS: GLITCH_GCS_BUCKET and Google Application Default Credentials are required for [gcs]"


@pytest.fixture
async def gcs_store() -> AsyncIterator[object]:
    from glitch_api.store.gcs import GcsBlobStore

    bucket = Settings().gcs_bucket
    if not bucket:
        pytest.fail(PENDING_CREDS)
    try:
        store = GcsBlobStore(bucket, f"glitch-test-{uuid.uuid4().hex[:12]}")
    except StoreError:
        pytest.fail(PENDING_CREDS)
    try:
        yield store
    finally:
        for key in await store.list():
            await store.delete(key)


async def test_real_bucket_crud_and_conditional_writes(gcs_store) -> None:
    store = gcs_store
    g1 = await store.create("caps/2026-10-19.json", b'{"global":1}')
    with pytest.raises(AlreadyExists):
        await store.create("caps/2026-10-19.json", b'{"global":9}')
    g2 = await store.put("caps/2026-10-19.json", b'{"global":2}', if_generation_match=g1)
    with pytest.raises(PreconditionFailed):
        await store.put("caps/2026-10-19.json", b'{"global":3}', if_generation_match=g1)
    blob = await store.get("caps/2026-10-19.json")
    assert blob is not None and blob.data == b'{"global":2}' and blob.generation == g2
    assert await store.list("caps/") == ["caps/2026-10-19.json"]


async def test_real_bucket_concurrent_counter_updates(gcs_store) -> None:
    def bump(cur):
        return {"n": (cur or {"n": 0})["n"] + 1}

    await asyncio.gather(*(update_json(gcs_store, "caps/race.json", bump, retries=20) for _ in range(5)))
    blob = await gcs_store.get("caps/race.json")
    assert blob is not None and blob.json() == {"n": 5}


async def test_real_bucket_scenario_cache_round_trip(gcs_store) -> None:
    repo = ScenarioRepository(gcs_store)
    data = parse_candidate("m1g2", fake_scenario("m1g2", 1))
    v, created = await repo.add("m1g2", data, model="test")
    again, created_again = await repo.add("m1g2", data, model="test")
    assert created and not created_again and again.id == v.id
    got = await repo.next_unseen("m1g2", frozenset())
    assert got is not None and got.data == data
    assert await repo.next_unseen("m1g2", frozenset({v.id})) is None
