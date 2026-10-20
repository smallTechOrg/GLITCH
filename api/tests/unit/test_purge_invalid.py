"""``python -m glitch_api.tools.purge_invalid`` — re-run the current validators over every
cached variation; dry-run lists failures (id + rules, never text), ``--apply`` moves them
to ``quarantine/`` and drops them from the index so they are never served."""

from __future__ import annotations

import asyncio
import io
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from glitch_api.config import Settings
from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.repository import DEMO_NAMESPACE, NAMESPACE, ScenarioRepository, content_hash, variation_id
from glitch_api.scenarios.schemas import SCHEMA_VERSION, parse_candidate
from glitch_api.store import BlobStore, LocalBlobStore, create_json, get_json, put_json, update_json
from glitch_api.tools import purge_invalid


def homework_data() -> dict[str, Any]:
    """The reported contradiction: a6 'confirmed' by the teacher yet marked VERIFY."""
    data = parse_candidate("m4g2", fake_scenario("m4g2", 3))
    data["answers"][5] = {
        "id": "a6",
        "statement": "Your homework is due Friday.",
        "confidence": 97,
        "evidence": "Teacher confirms due date",
        "trust": False,
    }
    return data


async def seed_raw(store: BlobStore, game_id: str, data: dict[str, Any], namespace: str = NAMESPACE) -> str:
    """Write an object + index entry the way an older validator would have (no re-validation)."""
    digest = content_hash(data)
    vid = variation_id(game_id, digest)
    envelope = {
        "id": vid,
        "gameId": game_id,
        "schemaVersion": SCHEMA_VERSION,
        "model": "old/model",
        "createdAt": "2026-10-01T00:00:00Z",
        "contentHash": digest,
        "data": data,
    }
    await create_json(store, f"{namespace}/{game_id}/{vid}.json", envelope)

    def add(current: Any) -> dict[str, Any]:
        doc = current if isinstance(current, dict) else {}
        entries = list(doc.get("variations", []))
        entries.append({"id": vid, "contentHash": digest, "createdAt": envelope["createdAt"]})
        return {"gameId": game_id, "schemaVersion": SCHEMA_VERSION, "variations": entries}

    await update_json(store, f"{namespace}/{game_id}/index.json", add)
    return vid


@pytest.fixture
def cache_dir(tmp_path: Path) -> Path:
    return tmp_path / "cache"


@pytest.fixture
def store(cache_dir: Path) -> LocalBlobStore:
    return LocalBlobStore(cache_dir)


@pytest.fixture
def seeded(store: LocalBlobStore) -> tuple[str, str]:
    async def go() -> tuple[str, str]:
        valid, _ = await ScenarioRepository(store).add("m4g2", parse_candidate("m4g2", fake_scenario("m4g2", 1)), model="m")
        invalid = await seed_raw(store, "m4g2", homework_data())
        return valid.id, invalid

    return asyncio.run(go())


def run_cli(argv: list[str], cache_dir: Path, make_settings: Callable[..., Settings]) -> tuple[int, str]:
    out = io.StringIO()
    code = purge_invalid.main([*argv, "--cache-dir", str(cache_dir)], settings=make_settings(), out=out)
    return code, out.getvalue()


def test_dry_run_is_default_and_lists_only_the_invalid(
    seeded: tuple[str, str], store: LocalBlobStore, cache_dir: Path, make_settings: Callable[..., Settings]
) -> None:
    valid, invalid = seeded
    before = asyncio.run(store.list(""))
    code, out = run_cli([], cache_dir, make_settings)
    assert code == 0
    assert f"INVALID {NAMESPACE}/m4g2/{invalid}" in out
    assert "item 6" in out and "trust must be true" in out  # the rule that failed
    assert valid not in out
    assert "homework" not in out.lower() and "teacher" not in out.lower()  # never generated text
    assert "2 checked, 1 invalid" in out and "dry run" in out.lower()
    assert asyncio.run(store.list("")) == before  # nothing written


def test_read_path_already_skips_the_invalid_variation(seeded: tuple[str, str], store: LocalBlobStore) -> None:
    valid, invalid = seeded
    repo = ScenarioRepository(store)
    assert asyncio.run(repo.get("m4g2", invalid)) is None
    served = asyncio.run(repo.next_unseen("m4g2", {valid}))
    assert served is None  # the only other cached variation is the contradictory one


def test_apply_quarantines_and_next_no_longer_serves_it(
    seeded: tuple[str, str], store: LocalBlobStore, cache_dir: Path, make_settings: Callable[..., Settings]
) -> None:
    valid, invalid = seeded
    code, out = run_cli(["--apply"], cache_dir, make_settings)
    assert code == 0
    assert f"QUARANTINED {NAMESPACE}/m4g2/{invalid}" in out and "1 quarantined" in out

    async def check() -> None:
        assert await store.get(f"{NAMESPACE}/m4g2/{invalid}.json") is None
        moved = await get_json(store, f"quarantine/{NAMESPACE}/m4g2/{invalid}.json")
        assert moved is not None and moved[0]["data"] == homework_data()  # kept for inspection
        repo = ScenarioRepository(store)
        assert [e.id for e in await repo.index("m4g2")] == [valid]
        assert (await repo.next_unseen("m4g2", set())).id == valid  # type: ignore[union-attr]
        assert await repo.next_unseen("m4g2", {valid}) is None

    asyncio.run(check())
    code, out = run_cli([], cache_dir, make_settings)  # idempotent: nothing left to purge
    assert code == 0 and "1 checked, 0 invalid" in out and "INVALID" not in out


def test_scans_every_game_and_both_namespaces(
    store: LocalBlobStore, cache_dir: Path, make_settings: Callable[..., Settings]
) -> None:
    async def go() -> tuple[str, str, str]:
        bad_fib = parse_candidate("m1g2", fake_scenario("m1g2", 1))
        bad_fib["sentences"] = bad_fib["sentences"][:-1]  # wrong count
        a = await seed_raw(store, "m1g2", bad_fib)
        b = await seed_raw(store, "m4g2", homework_data(), namespace=DEMO_NAMESPACE)
        # an object a crash left un-indexed, and an index entry whose object is gone
        await put_json(store, f"{NAMESPACE}/m4g1/m4g1-000000000000.json", {"id": "nope"})
        await update_json(
            store,
            f"{NAMESPACE}/m3g1/index.json",
            lambda _: {"gameId": "m3g1", "schemaVersion": SCHEMA_VERSION, "variations": [{"id": "m3g1-ffffffffffff", "contentHash": "f" * 64}]},
        )
        return a, b, "m3g1-ffffffffffff"

    fib, demo, missing = asyncio.run(go())
    code, out = run_cli([], cache_dir, make_settings)
    assert code == 0
    assert f"INVALID {NAMESPACE}/m1g2/{fib}" in out and "exactly" in out
    assert f"INVALID {DEMO_NAMESPACE}/m4g2/{demo}" in out
    assert f"INVALID {NAMESPACE}/m4g1/m4g1-000000000000" in out and "envelope mismatch" in out
    assert f"INVALID {NAMESPACE}/m3g1/{missing}" in out and "object missing" in out

    code, out = run_cli(["--apply"], cache_dir, make_settings)
    assert code == 0 and "4 quarantined" in out

    async def check() -> None:
        assert await store.list(f"{NAMESPACE}/m4g1/") == []
        assert await store.list(f"{NAMESPACE}/m1g2/") == [f"{NAMESPACE}/m1g2/index.json"]
        for ns, game in ((NAMESPACE, "m1g2"), (DEMO_NAMESPACE, "m4g2"), (NAMESPACE, "m3g1")):
            assert await ScenarioRepository(store, ns).index(game) == []
        assert await store.get(f"quarantine/{NAMESPACE}/m4g1/m4g1-000000000000.json") is not None

    asyncio.run(check())


def test_empty_or_absent_cache_reports_nothing(tmp_path: Path, make_settings: Callable[..., Settings]) -> None:
    code, out = run_cli([], tmp_path / "does-not-exist", make_settings)
    assert code == 0 and "0 checked, 0 invalid" in out


def test_bad_usage_exits_2(make_settings: Callable[..., Settings], tmp_path: Path) -> None:
    out = io.StringIO()
    with pytest.raises(SystemExit) as info:
        purge_invalid.main(["--dry-run", "--apply"], settings=make_settings(), out=out)
    assert info.value.code == 2
    code = purge_invalid.main(["--backend", "gcs"], settings=make_settings(), out=out)
    assert code == 2  # gcs with no bucket configured
