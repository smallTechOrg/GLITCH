"""ScenarioRepository on both blob backends: add / index / get / next_unseen / dedupe,
re-validation on read, restart survival and concurrent adds."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from pathlib import Path

import pytest

from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.repository import (
    DEMO_NAMESPACE,
    NAMESPACE,
    ScenarioRepository,
    content_hash,
    variation_id,
)
from glitch_api.scenarios.schemas import ScenarioInvalid, parse_candidate
from glitch_api.store import BlobStore, LocalBlobStore, get_json, put_json
from glitch_api.store.fake_gcs import FakeGcsClient
from glitch_api.store.gcs import GcsBlobStore


@pytest.fixture(params=["local", "gcs-fake"])
def store(request: pytest.FixtureRequest, tmp_path: Path) -> BlobStore:
    if request.param == "local":
        return LocalBlobStore(tmp_path / "cache")
    return GcsBlobStore("bucket", "test", client=FakeGcsClient())


@pytest.fixture
def repo(store: BlobStore) -> ScenarioRepository:
    return ScenarioRepository(store)


def case(game_id: str, n: int) -> dict:
    return parse_candidate(game_id, fake_scenario(game_id, n))


async def test_empty_cache(repo: ScenarioRepository) -> None:
    assert await repo.index("m1g2") == []
    assert await repo.count("m1g2") == 0
    assert await repo.next_unseen("m1g2", frozenset()) is None


async def test_add_writes_object_and_index_with_content_id(repo: ScenarioRepository, store: BlobStore) -> None:
    data = case("m1g2", 1)
    variation, created = await repo.add("m1g2", data, model="google/gemini-2.5-flash-lite")
    assert created is True
    digest = content_hash(data)
    assert variation.id == variation_id("m1g2", digest) == f"m1g2-{digest[:12]}"
    obj, _ = await get_json(store, f"scenarios/m1g2/{variation.id}.json")  # type: ignore[misc]
    assert obj == {
        "id": variation.id,
        "gameId": "m1g2",
        "schemaVersion": 1,
        "model": "google/gemini-2.5-flash-lite",
        "createdAt": variation.created_at,
        "contentHash": digest,
        "data": data,
    }
    index, _ = await get_json(store, "scenarios/m1g2/index.json")  # type: ignore[misc]
    assert index == {
        "gameId": "m1g2",
        "schemaVersion": 1,
        "variations": [{"id": variation.id, "contentHash": digest, "createdAt": variation.created_at}],
    }


async def test_duplicate_content_is_not_stored_twice(repo: ScenarioRepository) -> None:
    first, created1 = await repo.add("m4g2", case("m4g2", 2), model="a")
    again, created2 = await repo.add("m4g2", case("m4g2", 2), model="b")
    assert created1 is True and created2 is False
    assert again.id == first.id and again.model == "a"  # the original object is immutable
    assert await repo.count("m4g2") == 1


async def test_next_unseen_is_oldest_not_in_seen(repo: ScenarioRepository) -> None:
    ids = [(await repo.add("m3g1", case("m3g1", n), model="m"))[0].id for n in (1, 2, 3)]
    assert (await repo.next_unseen("m3g1", frozenset())).id == ids[0]  # type: ignore[union-attr]
    assert (await repo.next_unseen("m3g1", frozenset({ids[0]}))).id == ids[1]  # type: ignore[union-attr]
    assert (await repo.next_unseen("m3g1", frozenset({ids[0], ids[1]}))).id == ids[2]  # type: ignore[union-attr]
    assert await repo.next_unseen("m3g1", frozenset(ids)) is None


async def test_games_are_isolated(repo: ScenarioRepository) -> None:
    await repo.add("m1g1", case("m1g1", 1), model="m")
    assert await repo.next_unseen("m1g2", frozenset()) is None


async def test_demo_namespace_isolated(store: BlobStore) -> None:
    real, demo = ScenarioRepository(store, NAMESPACE), ScenarioRepository(store, DEMO_NAMESPACE)
    await demo.add("m1g2", case("m1g2", 1), model="glitch/demo-nova")
    assert await real.next_unseen("m1g2", frozenset()) is None
    assert await demo.next_unseen("m1g2", frozenset()) is not None


async def test_add_rejects_invalid_data(repo: ScenarioRepository) -> None:
    data = case("m1g2", 1)
    data["sentences"][0]["fib"] = True
    with pytest.raises(ScenarioInvalid):
        await repo.add("m1g2", data, model="m")
    assert await repo.count("m1g2") == 0


async def test_unknown_game_rejected(repo: ScenarioRepository) -> None:
    with pytest.raises(KeyError):
        await repo.index("m2g1")


async def test_tampered_or_missing_objects_are_skipped(repo: ScenarioRepository, store: BlobStore) -> None:
    bad = (await repo.add("m1g2", case("m1g2", 1), model="m"))[0]
    gone = (await repo.add("m1g2", case("m1g2", 2), model="m"))[0]
    good = (await repo.add("m1g2", case("m1g2", 3), model="m"))[0]
    tampered = bad.to_json()
    tampered["data"]["sentences"][1]["fib"] = not tampered["data"]["sentences"][1]["fib"]  # 2 or 4 fibs now
    await put_json(store, f"scenarios/m1g2/{bad.id}.json", tampered)
    await store.delete(f"scenarios/m1g2/{gone.id}.json")
    assert await repo.get("m1g2", bad.id) is None
    assert (await repo.next_unseen("m1g2", frozenset())).id == good.id  # type: ignore[union-attr]


async def test_old_schema_version_not_served(repo: ScenarioRepository, store: BlobStore) -> None:
    v = (await repo.add("m4g1", case("m4g1", 1), model="m"))[0]
    obj = v.to_json()
    obj["schemaVersion"] = 0
    await put_json(store, f"scenarios/m4g1/{v.id}.json", obj)
    assert await repo.next_unseen("m4g1", frozenset()) is None


async def test_object_without_index_entry_is_repaired(repo: ScenarioRepository, store: BlobStore) -> None:
    v = (await repo.add("m1g1", case("m1g1", 1), model="m"))[0]
    await store.delete("scenarios/m1g1/index.json")  # crash between object write and index write
    again, created = await repo.add("m1g1", case("m1g1", 1), model="m")
    assert again.id == v.id and created is True
    assert [e.id for e in await repo.index("m1g1")] == [v.id]


async def test_concurrent_adds_all_indexed(repo: ScenarioRepository) -> None:
    results = await asyncio.gather(*(repo.add("m4g2", case("m4g2", n), model="m") for n in range(1, 7)))
    assert all(created for _, created in results)
    assert sorted(e.id for e in await repo.index("m4g2")) == sorted(v.id for v, _ in results)


async def test_cache_survives_restart(tmp_path: Path) -> None:
    v = (await ScenarioRepository(LocalBlobStore(tmp_path)).add("m1g2", case("m1g2", 5), model="m"))[0]
    fresh = ScenarioRepository(LocalBlobStore(tmp_path))
    got = await fresh.next_unseen("m1g2", frozenset())
    assert got is not None and got.id == v.id and got.data == v.data


@pytest.mark.parametrize("make", [lambda p: LocalBlobStore(p)], ids=["local"])
async def test_index_tolerates_garbage_entries(tmp_path: Path, make: Callable[[Path], BlobStore]) -> None:
    store = make(tmp_path)
    repo = ScenarioRepository(store)
    v = (await repo.add("m1g2", case("m1g2", 1), model="m"))[0]
    index, gen = await get_json(store, "scenarios/m1g2/index.json")  # type: ignore[misc]
    index["variations"].insert(0, "garbage")
    index["variations"].insert(0, {"id": 7})
    await put_json(store, "scenarios/m1g2/index.json", index, if_generation_match=gen)
    assert [e.id for e in await repo.index("m1g2")] == [v.id]
