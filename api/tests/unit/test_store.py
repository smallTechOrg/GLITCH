"""Blob store contract — the same tests run against LocalBlobStore and GcsBlobStore(fake client).

Covers get/put/list/delete, conditional create, generation preconditions (conflicts),
optimistic update_json under concurrency, key validation, restart survival (local) and
error mapping (gcs).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from pathlib import Path

import pytest
from google.api_core import exceptions as gexc

from glitch_api.config import ConfigError, Settings
from glitch_api.store import (
    NO_OBJECT,
    AlreadyExists,
    BlobStore,
    ConflictRetriesExhausted,
    InvalidKey,
    LocalBlobStore,
    PreconditionFailed,
    StoreError,
    build_store,
    create_json,
    get_json,
    put_json,
    update_json,
)
from glitch_api.store.fake_gcs import FakeGcsClient
from glitch_api.store.gcs import GcsBlobStore


@pytest.fixture(params=["local", "gcs-fake"])
def make_store(request: pytest.FixtureRequest, tmp_path: Path) -> Callable[..., BlobStore]:
    client = FakeGcsClient()

    def _make(prefix: str = "") -> BlobStore:
        if request.param == "local":
            return LocalBlobStore(tmp_path / "blobs", prefix)
        return GcsBlobStore("test-bucket", prefix, client=client)

    return _make


@pytest.fixture
def store(make_store: Callable[..., BlobStore]) -> BlobStore:
    return make_store()


# ---- basic CRUD -------------------------------------------------------------------------
async def test_get_missing_returns_none(store: BlobStore) -> None:
    assert await store.get("scenarios/m1g2/index.json") is None


async def test_put_then_get_round_trip_with_generation(store: BlobStore) -> None:
    gen = await store.put("a/b.json", b'{"x":1}')
    blob = await store.get("a/b.json")
    assert blob is not None
    assert blob.data == b'{"x":1}'
    assert blob.generation == gen > 0
    assert blob.json() == {"x": 1}


async def test_every_write_changes_generation(store: BlobStore) -> None:
    g1 = await store.put("k.json", b"1")
    g2 = await store.put("k.json", b"1")  # same bytes still a new generation
    g3 = await store.put("k.json", b"2")
    assert g1 < g2 < g3


async def test_list_is_sorted_recursive_and_prefix_filtered(store: BlobStore) -> None:
    for key in ("scenarios/m1g2/b.json", "scenarios/m1g2/a.json", "scenarios/m4g1/c.json", "caps/2026-10-19.json"):
        await store.put(key, b"{}")
    assert await store.list("scenarios/m1g2/") == ["scenarios/m1g2/a.json", "scenarios/m1g2/b.json"]
    assert await store.list("scenarios/") == [
        "scenarios/m1g2/a.json",
        "scenarios/m1g2/b.json",
        "scenarios/m4g1/c.json",
    ]
    assert len(await store.list()) == 4
    assert await store.list("nothing/") == []


async def test_delete(store: BlobStore) -> None:
    await store.put("d.json", b"x")
    assert await store.delete("d.json") is True
    assert await store.get("d.json") is None
    assert await store.delete("d.json") is False


async def test_prefix_isolates_namespaces(make_store: Callable[..., BlobStore]) -> None:
    a, b = make_store("run-a"), make_store("run-b")
    await a.put("k.json", b"A")
    await b.put("k.json", b"B")
    assert (await a.get("k.json")).data == b"A"  # type: ignore[union-attr]
    assert (await b.get("k.json")).data == b"B"  # type: ignore[union-attr]
    assert await a.list() == ["k.json"]


# ---- conditional writes -----------------------------------------------------------------
async def test_conditional_create_succeeds_once_then_conflicts(store: BlobStore) -> None:
    gen = await store.create("scenarios/m1g2/v1.json", b"first")
    with pytest.raises(AlreadyExists):
        await store.create("scenarios/m1g2/v1.json", b"second")
    blob = await store.get("scenarios/m1g2/v1.json")
    assert blob is not None and blob.data == b"first" and blob.generation == gen


async def test_put_with_no_object_precondition_is_create(store: BlobStore) -> None:
    await store.put("x.json", b"1", if_generation_match=NO_OBJECT)
    with pytest.raises(PreconditionFailed):
        await store.put("x.json", b"2", if_generation_match=NO_OBJECT)


async def test_stale_generation_write_conflicts_and_writes_nothing(store: BlobStore) -> None:
    g1 = await store.put("idx.json", b"v1")
    g2 = await store.put("idx.json", b"v2", if_generation_match=g1)
    with pytest.raises(PreconditionFailed) as info:
        await store.put("idx.json", b"stale", if_generation_match=g1)
    assert not isinstance(info.value, AlreadyExists)
    blob = await store.get("idx.json")
    assert blob is not None and blob.data == b"v2" and blob.generation == g2


async def test_generation_match_on_missing_object_conflicts(store: BlobStore) -> None:
    with pytest.raises(PreconditionFailed):
        await store.put("missing.json", b"x", if_generation_match=12345)
    assert await store.get("missing.json") is None


async def test_conditional_delete(store: BlobStore) -> None:
    g1 = await store.put("del.json", b"1")
    await store.put("del.json", b"2")
    with pytest.raises(PreconditionFailed):
        await store.delete("del.json", if_generation_match=g1)
    assert await store.get("del.json") is not None


async def test_concurrent_creates_exactly_one_wins(store: BlobStore) -> None:
    results = await asyncio.gather(
        *(store.create("race.json", str(i).encode()) for i in range(8)), return_exceptions=True
    )
    wins = [r for r in results if isinstance(r, int)]
    conflicts = [r for r in results if isinstance(r, AlreadyExists)]
    assert len(wins) == 1 and len(conflicts) == 7


# ---- JSON helpers + optimistic update ---------------------------------------------------
async def test_json_helpers(store: BlobStore) -> None:
    gen = await create_json(store, "j.json", {"b": 1, "a": [1, 2]})
    got = await get_json(store, "j.json")
    assert got == ({"a": [1, 2], "b": 1}, gen)
    gen2 = await put_json(store, "j.json", {"a": 3}, if_generation_match=gen)
    assert (await get_json(store, "j.json")) == ({"a": 3}, gen2)
    assert (await store.get("j.json")).data == b'{"a":3}'  # type: ignore[union-attr]  # canonical


async def test_update_json_concurrent_increments_never_lose_a_write(store: BlobStore) -> None:
    def bump(current: dict | None) -> dict:
        value = dict(current or {"n": 0})
        value["n"] += 1
        return value

    await asyncio.gather(*(update_json(store, "caps/day.json", bump, retries=50) for _ in range(10)))
    assert (await get_json(store, "caps/day.json"))[0] == {"n": 10}  # type: ignore[index]


async def test_update_json_gives_up_after_retries() -> None:
    client = FakeGcsClient()
    store = GcsBlobStore("b", client=client)
    await put_json(store, "hot.json", {"n": 0})

    def interfere(bucket: str, name: str) -> None:
        # A rival writer lands between our read and our write, every time.
        objects = client.buckets[bucket]
        obj = objects[name]
        obj.generation = client._next_generation()

    client.on_upload = interfere
    client.calls.clear()
    with pytest.raises(ConflictRetriesExhausted):
        await update_json(store, "hot.json", lambda cur: {"n": cur["n"] + 1}, retries=2)
    uploads = [c for c in client.calls if c[0] == "upload"]
    assert len(uploads) == 3  # 1 + 2 retries, each conflicting


# ---- key validation ---------------------------------------------------------------------
@pytest.mark.parametrize("key", ["", "/abs.json", "a/../b.json", "a//b.json", "dir/", ".hidden", "a/.tmp", "sp ace.json", "a\\b"])
async def test_invalid_keys_rejected(store: BlobStore, key: str) -> None:
    with pytest.raises(InvalidKey):
        await store.put(key, b"x")
    with pytest.raises(InvalidKey):
        await store.get(key)


# ---- local-only behaviour ---------------------------------------------------------------
async def test_local_survives_restart_and_keeps_generation(tmp_path: Path) -> None:
    first = LocalBlobStore(tmp_path)
    gen = await first.put("caps/2026-10-19.json", b'{"global":3}')
    second = LocalBlobStore(tmp_path)  # a new process would build a fresh instance
    blob = await second.get("caps/2026-10-19.json")
    assert blob is not None and blob.data == b'{"global":3}' and blob.generation == gen
    assert await second.put("caps/2026-10-19.json", b"{}", if_generation_match=gen) > gen


async def test_local_leaves_no_temp_files_and_hides_lock(tmp_path: Path) -> None:
    store = LocalBlobStore(tmp_path)
    for i in range(5):
        await store.put("a/b.json", str(i).encode())
    assert sorted(p.name for p in (tmp_path / "a").iterdir()) == ["b.json"]
    assert await store.list() == ["a/b.json"]  # .lock not listed


# ---- gcs adapter specifics --------------------------------------------------------------
async def test_gcs_object_names_carry_prefix() -> None:
    client = FakeGcsClient()
    store = GcsBlobStore("bkt", "glitch-test-123", client=client)
    await store.put("scenarios/m1g2/index.json", b"{}")
    assert list(client.buckets["bkt"]) == ["glitch-test-123/scenarios/m1g2/index.json"]
    assert await store.list("scenarios/") == ["scenarios/m1g2/index.json"]


async def test_gcs_backend_errors_map_to_store_error() -> None:
    client = FakeGcsClient()
    store = GcsBlobStore("bkt", client=client)
    client.fail_next = gexc.ServiceUnavailable("backend down")
    with pytest.raises(StoreError):
        await store.put("k.json", b"x")
    client.fail_next = gexc.Forbidden("no access")
    with pytest.raises(StoreError):
        await store.get("k.json")
    client.fail_next = gexc.InternalServerError("boom")
    with pytest.raises(StoreError):
        await store.list()


def test_gcs_requires_bucket() -> None:
    with pytest.raises(StoreError):
        GcsBlobStore("", client=FakeGcsClient())


# ---- factory + config -------------------------------------------------------------------
def test_build_store_local_resolves_relative_cache_dir(make_settings: Callable[..., Settings]) -> None:
    store = build_store(make_settings())
    assert isinstance(store, LocalBlobStore)
    assert store.root == (Path(__file__).resolve().parents[3] / "api" / ".cache").resolve()


def test_build_store_local_absolute_dir_and_prefix(make_settings: Callable[..., Settings], tmp_path: Path) -> None:
    store = build_store(make_settings(cache_dir=str(tmp_path), blob_prefix="dev"))
    assert isinstance(store, LocalBlobStore) and store.base == tmp_path.resolve() / "dev"


def test_build_store_gcs_with_injected_client(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(blob_backend="gcs", gcs_bucket="my-bucket", blob_prefix="p")
    store = build_store(settings, gcs_client=FakeGcsClient())
    assert isinstance(store, GcsBlobStore) and store.bucket_name == "my-bucket" and store.prefix == "p"


def test_gcs_backend_without_bucket_refuses_to_start(make_settings: Callable[..., Settings]) -> None:
    settings = make_settings(blob_backend="gcs")
    with pytest.raises(ConfigError, match="GLITCH_GCS_BUCKET"):
        settings.startup_check()


def test_blob_backend_env_value_tolerates_inline_comment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GLITCH_BLOB_BACKEND", "gcs   # bucket in prod")
    monkeypatch.setenv("GLITCH_GCS_BUCKET", "  ")
    settings = Settings(_env_file=None)
    assert settings.blob_backend == "gcs" and settings.gcs_bucket is None
