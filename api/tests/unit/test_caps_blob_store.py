"""BlobCounterStore (P2-D2): durable per-UTC-day counters with generation-checked writes.

Backends: ``LocalBlobStore`` on a temp dir and ``GcsBlobStore`` over the in-memory
``FakeGcsClient``. The real-bucket round trip is marked ``gcs`` (PENDING-CREDS without
``GLITCH_GCS_BUCKET`` + ADC).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from glitch_api.caps.blob_store import (
    FAIL_CLOSED_COUNT,
    BlobCounterStore,
    caps_object_key,
    counter_store_for,
    parse_counter_key,
)
from glitch_api.caps.budget import EnergyService
from glitch_api.caps.store import CounterStore
from glitch_api.device import device_hash
from glitch_api.store.base import NO_OBJECT, Blob, StoreError, dumps
from glitch_api.store.fake_gcs import FakeGcsClient
from glitch_api.store.gcs import GcsBlobStore
from glitch_api.store.local import LocalBlobStore

RAW_ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c"
DEV = device_hash(RAW_ID)
DAY = "2026-10-19"
DKEY = f"device:{DEV}:{DAY}"
GKEY = f"global:{DAY}"


def _local(path: Path, **kw: Any) -> BlobCounterStore:
    return BlobCounterStore(LocalBlobStore(path), **kw)


async def _doc(blob_store: Any, day: str = DAY) -> dict[str, Any] | None:
    blob = await blob_store.get(caps_object_key(day))
    return None if blob is None else blob.json()


class RacingStore:
    """Wraps a BlobStore; before each of the first ``races`` conditional puts, a rival
    writer (another store instance with its own lock) increments the global counter, so
    the wrapped put fails its generation precondition."""

    def __init__(self, inner: Any, rival_root: Any, races: int) -> None:
        self.inner = inner
        self.backend = inner.backend
        self.rival = BlobCounterStore(rival_root, backoff_s=0)
        self.races = races
        self.raced = 0

    async def get(self, key: str) -> Blob | None:
        return await self.inner.get(key)

    async def put(
        self,
        key: str,
        data: bytes,
        *,
        if_generation_match: int | None = None,
        **kw: Any,
    ) -> int:
        if self.raced < self.races:
            self.raced += 1
            ok, _ = await self.rival.incr_if_below(GKEY, 10_000)
            assert ok
        return await self.inner.put(
            key, data, if_generation_match=if_generation_match, **kw
        )

    async def create(self, key: str, data: bytes, **kw: Any) -> int:
        return await self.put(key, data, if_generation_match=NO_OBJECT)

    async def list(self, prefix: str = "") -> list[str]:
        return await self.inner.list(prefix)

    async def delete(self, key: str, *, if_generation_match: int | None = None) -> bool:
        return await self.inner.delete(key, if_generation_match=if_generation_match)


class BrokenStore:
    backend = "broken"

    async def get(self, key: str) -> Blob | None:
        raise StoreError("backend down")

    async def put(self, *a: Any, **kw: Any) -> int:
        raise StoreError("backend down")

    async def create(self, *a: Any, **kw: Any) -> int:
        raise StoreError("backend down")

    async def list(self, prefix: str = "") -> list[str]:
        raise StoreError("backend down")

    async def delete(self, *a: Any, **kw: Any) -> bool:
        raise StoreError("backend down")


# ---- protocol + layout ----------------------------------------------------------------
def test_implements_counter_store_protocol(tmp_path: Path) -> None:
    assert isinstance(_local(tmp_path), CounterStore)


def test_parse_counter_key_accepts_hashed_ids_and_rejects_raw_ids() -> None:
    assert parse_counter_key(DKEY) == (DAY, DEV)
    assert parse_counter_key(GKEY) == (DAY, None)
    for bad in (
        f"device:{RAW_ID}:{DAY}",
        f"device:{DEV}",
        "global:today",
        "k:1",
        f"device:{DEV.upper()}:{DAY}",
    ):
        with pytest.raises(ValueError) as info:
            parse_counter_key(bad)
        assert RAW_ID not in str(info.value)


async def test_incr_get_and_object_layout_store_only_hashed_ids(tmp_path: Path) -> None:
    store = _local(tmp_path)
    assert await store.get(DKEY) == 0 and await store.get(GKEY) == 0
    assert await store.incr_if_below(DKEY, 10) == (True, 1)
    assert await store.incr_if_below(DKEY, 10) == (True, 2)
    assert await store.incr_if_below(GKEY, 500) == (True, 1)
    assert await store.get(DKEY) == 2 and await store.get(GKEY) == 1
    assert await _doc(store.blob) == {"devices": {DEV: 2}, "global": 1}
    raw = (tmp_path / "caps" / f"{DAY}.json").read_text()
    assert RAW_ID not in raw and DEV in raw


async def test_incr_if_below_stops_at_limit(tmp_path: Path) -> None:
    store = _local(tmp_path)
    assert [await store.incr_if_below(DKEY, 2) for _ in range(3)] == [
        (True, 1),
        (True, 2),
        (False, 2),
    ]
    assert await store.get(DKEY) == 2


async def test_decr_floors_at_zero_and_never_creates_objects(tmp_path: Path) -> None:
    store = _local(tmp_path)
    assert await store.decr(DKEY) == 0
    assert (
        await _doc(store.blob) is None
    )  # a refund with nothing reserved writes nothing
    await store.incr_if_below(DKEY, 5)
    await store.incr_if_below(GKEY, 5)
    assert await store.decr(DKEY) == 0
    assert await store.decr(DKEY) == 0
    assert await _doc(store.blob) == {
        "devices": {},
        "global": 1,
    }  # zeroed device dropped
    assert await store.decr(GKEY) == 0 and await store.decr(GKEY) == 0


# ---- durability ---------------------------------------------------------------------------
async def test_restart_new_instance_sees_same_counts(tmp_path: Path) -> None:
    first = _local(tmp_path)
    for _ in range(3):
        await first.incr_if_below(DKEY, 10)
    await first.incr_if_below(GKEY, 500)
    second = _local(tmp_path)  # "restarted server": fresh objects, same directory
    assert await second.get(DKEY) == 3 and await second.get(GKEY) == 1
    assert await second.incr_if_below(DKEY, 10) == (True, 4)


async def test_restart_energy_service_shows_seven_remaining(
    tmp_path: Path, frozen_clock
) -> None:
    service = EnergyService(
        _local(tmp_path), device_cap=10, global_cap=500, clock=frozen_clock
    )
    for _ in range(3):
        assert await service.reserve_device(DEV) == DAY
    restarted = EnergyService(
        _local(tmp_path), device_cap=10, global_cap=500, clock=frozen_clock
    )
    energy = await restarted.energy(DEV)
    assert energy.remaining == 7 and energy.resets_at == "2026-10-20T00:00:00Z"


# ---- concurrency ----------------------------------------------------------------------------
async def test_concurrent_incr_from_many_tasks_is_exact(tmp_path: Path) -> None:
    store = _local(tmp_path)
    results = await asyncio.gather(
        *(store.incr_if_below(GKEY, 1000) for _ in range(60))
    )
    assert all(ok for ok, _ in results)
    assert sorted(v for _, v in results) == list(range(1, 61))
    assert await store.get(GKEY) == 60
    assert store.conflicts == 0  # one instance serialises itself — no wasted writes


async def test_concurrent_instances_never_lose_or_double_count(tmp_path: Path) -> None:
    stores = [_local(tmp_path, retries=200, backoff_s=0.001) for _ in range(4)]
    results = await asyncio.gather(
        *(s.incr_if_below(GKEY, 10_000) for s in stores for _ in range(15))
    )
    assert sum(ok for ok, _ in results) == 60
    assert await _local(tmp_path).get(GKEY) == 60


async def test_concurrent_instances_with_default_retries_count_exactly_what_succeeded(
    tmp_path: Path,
) -> None:
    stores = [_local(tmp_path) for _ in range(4)]
    results = await asyncio.gather(
        *(s.incr_if_below(GKEY, 10_000) for s in stores for _ in range(15))
    )
    succeeded = sum(ok for ok, _ in results)
    assert succeeded > 0
    assert (
        await _local(tmp_path).get(GKEY) == succeeded
    )  # a denied incr never lands; none is lost


async def test_burst_reserve_is_atomic_with_blob_store(
    tmp_path: Path, frozen_clock
) -> None:
    service = EnergyService(
        _local(tmp_path), device_cap=1, global_cap=500, clock=frozen_clock
    )
    results = await asyncio.gather(*(service.reserve_device(DEV) for _ in range(20)))
    assert sum(r is not None for r in results) == 1
    assert (await service.energy(DEV)).remaining == 0


async def test_concurrent_global_charges_never_exceed_cap_with_blob_store(
    tmp_path: Path, frozen_clock
) -> None:
    service = EnergyService(
        _local(tmp_path), device_cap=3, global_cap=10, clock=frozen_clock
    )
    results = await asyncio.gather(*(service.charge_global() for _ in range(50)))
    assert sum(results) == 10 and await service.global_remaining() == 0


async def test_two_concurrent_charges_on_two_instances_both_persist(
    tmp_path: Path,
) -> None:
    a, b = _local(tmp_path), _local(tmp_path)
    results = await asyncio.gather(a.incr_if_below(DKEY, 10), b.incr_if_below(DKEY, 10))
    assert [ok for ok, _ in results] == [True, True]
    assert await _local(tmp_path).get(DKEY) == 2


# ---- conflict retry -------------------------------------------------------------------------
async def test_conflict_is_retried_and_includes_the_rivals_write(
    tmp_path: Path,
) -> None:
    inner = LocalBlobStore(tmp_path)
    store = BlobCounterStore(RacingStore(inner, inner, races=3), backoff_s=0)
    assert await store.incr_if_below(GKEY, 100) == (
        True,
        4,
    )  # 3 rival increments + ours
    assert store.conflicts == 3
    assert await _doc(inner) == {"devices": {}, "global": 4}


async def test_retries_exhausted_fails_closed_without_writing(tmp_path: Path) -> None:
    inner = LocalBlobStore(tmp_path)
    store = BlobCounterStore(
        RacingStore(inner, inner, races=100), retries=5, backoff_s=0
    )
    assert await store.incr_if_below(DKEY, 10) == (
        False,
        10,
    )  # denied: caller refuses the AI call
    assert store.conflicts == 6
    assert await _doc(inner) == {
        "devices": {},
        "global": 6,
    }  # only the rival's 6 writes landed


async def test_backoff_sleeps_between_retries(tmp_path: Path) -> None:
    inner = LocalBlobStore(tmp_path)
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    store = BlobCounterStore(
        RacingStore(inner, inner, races=2), backoff_s=0.01, sleep=fake_sleep
    )
    assert await store.incr_if_below(GKEY, 100) == (True, 3)
    assert len(sleeps) == 2 and all(0 <= s <= 0.02 for s in sleeps)


# ---- fail closed ------------------------------------------------------------------------------
async def test_unreachable_store_fails_closed(frozen_clock) -> None:
    store = BlobCounterStore(BrokenStore())
    assert await store.get(DKEY) == FAIL_CLOSED_COUNT
    assert await store.incr_if_below(DKEY, 10) == (False, 10)
    assert await store.decr(DKEY) == FAIL_CLOSED_COUNT
    await store.prune(keep_suffix=f":{DAY}")  # best-effort: never raises
    service = EnergyService(store, device_cap=10, global_cap=500, clock=frozen_clock)
    assert (await service.energy(DEV)).remaining == 0
    assert await service.reserve_device(DEV) is None


@pytest.mark.parametrize(
    "payload", [b"not json", b"[1,2]", b'{"global": -1}', b'{"devices": {"x": "2"}}']
)
async def test_malformed_object_fails_closed_and_is_not_overwritten(
    tmp_path: Path, payload: bytes
) -> None:
    inner = LocalBlobStore(tmp_path)
    await inner.put(caps_object_key(DAY), payload)
    store = BlobCounterStore(inner)
    assert await store.get(GKEY) == FAIL_CLOSED_COUNT
    assert await store.incr_if_below(GKEY, 10) == (False, 10)
    blob = await inner.get(caps_object_key(DAY))
    assert blob is not None and blob.data == payload


# ---- UTC days + retention -------------------------------------------------------------------
async def test_utc_rollover_starts_a_new_object_and_keeps_yesterday(
    tmp_path: Path, frozen_clock
) -> None:
    store = _local(tmp_path)
    service = EnergyService(store, device_cap=1, global_cap=1, clock=frozen_clock)
    assert await service.reserve_device(DEV) == DAY
    assert await service.charge_global()
    frozen_clock.set(datetime(2026, 10, 19, 23, 59, 59, tzinfo=UTC))
    assert await service.check(DEV) == "device"
    frozen_clock.advance(1)  # 2026-10-20T00:00:00Z
    assert (await service.energy(DEV)).remaining == 1
    assert await service.global_remaining() == 1
    assert await service.reserve_device(DEV) == "2026-10-20"
    assert await store.blob.list("caps/") == [
        "caps/2026-10-19.json",
        "caps/2026-10-20.json",
    ]
    assert await _doc(store.blob, "2026-10-19") == {"devices": {DEV: 1}, "global": 1}


async def test_refund_for_previous_day_does_not_touch_today(
    tmp_path: Path, frozen_clock
) -> None:
    service = EnergyService(
        _local(tmp_path), device_cap=1, global_cap=500, clock=frozen_clock
    )
    day = await service.reserve_device(DEV)
    frozen_clock.advance(24 * 3600)
    assert await service.reserve_device(DEV) == "2026-10-20"
    await service.refund_device(DEV, day)
    assert (await service.energy(DEV)).remaining == 0


async def test_prune_deletes_only_objects_older_than_retention(tmp_path: Path) -> None:
    store = _local(tmp_path)
    for day in ("2026-10-01", "2026-10-11", "2026-10-12", "2026-10-19"):
        await store.incr_if_below(f"global:{day}", 5)
    await store.blob.put("caps/notes.txt", b"keep")  # unrelated objects are left alone
    await store.prune(keep_suffix=":2026-10-19")
    assert await store.blob.list("caps/") == [
        "caps/2026-10-12.json",
        "caps/2026-10-19.json",
        "caps/notes.txt",
    ]
    await store.prune(keep_suffix="garbage")  # unparsable → no-op


# ---- GCS adapter (fake client) ------------------------------------------------------------------
async def test_fake_gcs_round_trip_and_restart() -> None:
    client = FakeGcsClient()
    store = BlobCounterStore(GcsBlobStore("glitch-test", "pfx", client=client))
    assert await store.incr_if_below(DKEY, 10) == (True, 1)
    assert await store.incr_if_below(GKEY, 500) == (True, 1)
    obj = client.buckets["glitch-test"][f"pfx/caps/{DAY}.json"]
    assert json.loads(obj.data) == {"devices": {DEV: 1}, "global": 1}
    assert RAW_ID.encode() not in obj.data
    restarted = BlobCounterStore(GcsBlobStore("glitch-test", "pfx", client=client))
    assert await restarted.get(DKEY) == 1
    assert await restarted.decr(DKEY) == 0
    assert json.loads(client.buckets["glitch-test"][f"pfx/caps/{DAY}.json"].data) == {
        "devices": {},
        "global": 1,
    }


async def test_fake_gcs_conflicting_writer_is_detected_and_retried() -> None:
    client = FakeGcsClient()
    gcs = GcsBlobStore("glitch-test", client=client)
    name = f"caps/{DAY}.json"
    rival_writes = {"left": 2}

    def rival(bucket: str, obj_name: str) -> None:
        # A second instance writes between our read and our conditional upload (twice).
        if obj_name != name or rival_writes["left"] == 0:
            return
        rival_writes["left"] -= 1
        objects = client.buckets[bucket]
        doc = (
            json.loads(objects[obj_name].data)
            if obj_name in objects
            else {"devices": {}, "global": 0}
        )
        doc["global"] += 1
        hook, client.on_upload = client.on_upload, None
        try:
            client.bucket(bucket).blob(obj_name).upload_from_string(
                dumps(doc), "application/json"
            )
        finally:
            client.on_upload = hook

    client.on_upload = rival
    store = BlobCounterStore(gcs, backoff_s=0)
    assert await store.incr_if_below(GKEY, 100) == (True, 3)
    assert store.conflicts == 2
    assert json.loads(client.buckets["glitch-test"][name].data)["global"] == 3


async def test_fake_gcs_concurrent_instances_are_exact() -> None:
    client = FakeGcsClient()
    stores = [
        BlobCounterStore(GcsBlobStore("b", client=client), retries=200, backoff_s=0.001)
        for _ in range(3)
    ]
    results = await asyncio.gather(
        *(s.incr_if_below(DKEY, 10_000) for s in stores for _ in range(10))
    )
    assert sum(ok for ok, _ in results) == 30
    assert await BlobCounterStore(GcsBlobStore("b", client=client)).get(DKEY) == 30


# ---- selection ------------------------------------------------------------------------------------
def test_counter_store_for_prefers_injected_store_then_builds_blob_store(
    tmp_path: Path,
) -> None:
    class State:
        pass

    class App:
        state = State()

    injected = _local(tmp_path)
    App.state.counter_store = injected
    assert counter_store_for(App) is injected

    other = type("App2", (), {"state": State()})
    built = counter_store_for(other)
    assert isinstance(built, BlobCounterStore)
    assert counter_store_for(other) is built  # cached per app


# ---- real bucket (PENDING-CREDS without GLITCH_GCS_BUCKET + ADC) ----------------------------------
@pytest.mark.gcs
async def test_real_bucket_conflicting_write_is_detected_and_retried() -> None:
    from glitch_api.config import Settings

    bucket = Settings().gcs_bucket
    if not bucket:
        pytest.fail(
            "PENDING-CREDS: GLITCH_GCS_BUCKET (+ Application Default Credentials) required for -m gcs"
        )
    prefix = f"test-caps-{uuid.uuid4().hex[:12]}"
    gcs = GcsBlobStore(bucket, prefix)
    try:
        store = BlobCounterStore(RacingStore(gcs, gcs, races=2), backoff_s=0)
        assert await store.incr_if_below(GKEY, 100) == (True, 3)
        assert store.conflicts == 2
        assert await BlobCounterStore(GcsBlobStore(bucket, prefix)).get(GKEY) == 3
    finally:
        for key in await gcs.list(""):
            await gcs.delete(key)
