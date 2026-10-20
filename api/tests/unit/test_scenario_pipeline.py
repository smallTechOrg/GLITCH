"""Scenario pipeline (spec/agent.md → Composition 2) with a scripted provider.

Hit / miss / seen exclusion / all-seen → generate / one validator-fed regeneration /
failure fallbacks (invalid twice, moderation, links, timeout, provider error, caps,
store failure, duplicate) / energy accounting / metrics / logs / bank mode.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from glitch_api.caps.budget import EnergyService
from glitch_api.caps.store import MemoryCounterStore
from glitch_api.llm.base import LLMProviderError, LLMRequest, LLMResult, LLMTimeoutError
from glitch_api.logging import configure_logging
from glitch_api.metrics import get_metrics
from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.pipeline import ScenarioOptions, run_scenario
from glitch_api.scenarios.repository import ScenarioRepository, content_hash, variation_id
from glitch_api.scenarios.schemas import GAMES, parse_candidate
from glitch_api.store import LocalBlobStore, StoreError

DEVICE = "a1b2c3d4e5f6"


class ScriptedProvider:
    """Returns the scripted outputs in order (str = content, Exception = raised)."""

    name = "openrouter"
    model = "google/gemini-2.5-flash-lite"

    def __init__(self, *outputs: str | Exception | Callable[[LLMRequest], str], delay_s: float = 0.0) -> None:
        self.outputs = list(outputs)
        self.requests: list[LLMRequest] = []
        self.delay_s = delay_s

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.requests.append(request)
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if not self.outputs:
            raise AssertionError("provider called more times than scripted")
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        text = out(request) if callable(out) else out
        return LLMResult(
            text=text,
            provider="openrouter",
            model_requested=self.model,
            model_used="google/gemini-2.5-flash-lite-001",
            prompt_tokens=900,
            completion_tokens=300,
            latency_ms=12.0,
        )

    async def aclose(self) -> None:
        return None


def good(game_id: str, n: int = 1) -> str:
    return json.dumps(fake_scenario(game_id, n))


def broken_fibs() -> str:
    obj = fake_scenario("m1g2", 1)
    obj["sentences"][0].update(fib=True, explanation="Wrong on purpose.")  # 4 fibs
    return json.dumps(obj)


@pytest.fixture
def repo(tmp_path: Path) -> ScenarioRepository:
    return ScenarioRepository(LocalBlobStore(tmp_path / "cache"))


@pytest.fixture
def energy(frozen_clock: Any) -> EnergyService:
    return EnergyService(MemoryCounterStore(), device_cap=10, global_cap=500, clock=frozen_clock)


@pytest.fixture
def log_lines(tmp_path: Path) -> Callable[[], list[dict[str, Any]]]:
    path = tmp_path / "api.log"
    configure_logging("INFO", str(path))

    def read() -> list[dict[str, Any]]:
        return [json.loads(x) for x in path.read_text().splitlines() if x.strip()] if path.exists() else []

    yield read
    configure_logging("INFO", None)


async def run(game_id: str, provider: Any, repo: ScenarioRepository, energy: EnergyService | None, seen: set[str] | None = None, **kw: Any):
    return await run_scenario(game_id, frozenset(seen or ()), DEVICE if energy else None, provider=provider, repo=repo, energy=energy, **kw)


# ---- miss → generate → store ------------------------------------------------------------
@pytest.mark.parametrize("game_id", list(GAMES))
async def test_miss_generates_one_call_stores_and_charges(game_id: str, repo, energy, log_lines) -> None:
    provider = ScriptedProvider(good(game_id))
    s = await run(game_id, provider, repo, energy)
    assert s.error is None and s.result is not None
    assert s.result.cached is False and s.result.game_id == game_id and s.result.schema_version == 1
    expected = parse_candidate(game_id, fake_scenario(game_id, 1))
    assert s.result.data == expected
    assert s.result.variation_id == variation_id(game_id, content_hash(expected))
    assert len(provider.requests) == 1  # ONE call for the whole scenario
    req = provider.requests[0]
    assert req.purpose == "scenario_gen" and req.json_schema == GAMES[game_id].llm_json_schema
    assert req.temperature == 0.7  # lowered from 0.9 to cut invalid generations
    assert f"<game>{game_id}</game>" in req.messages[1].content
    assert "<case_number>1</case_number>" in req.messages[1].content
    assert [v.id for v in [await repo.get(game_id, s.result.variation_id)] if v] == [s.result.variation_id]
    assert s.energy is not None and s.energy.remaining == 9
    assert await energy.global_remaining() == 499
    m = get_metrics().snapshot()
    assert m["cache_misses"] == 1 and m["cache_hits"] == 0 and m["llm_calls_by_outcome"] == {"ok": 1}
    calls = [x for x in log_lines() if x["event"] == "llm_call"]
    assert len(calls) == 1
    assert calls[0]["cache"] == "miss" and calls[0]["outcome"] == "ok" and calls[0]["purpose"] == "scenario_gen"
    assert calls[0]["variation_id"] == s.result.variation_id and calls[0]["prompt_tokens"] == 900


async def test_case_number_follows_cache_size(repo, energy) -> None:
    await run("m1g2", ScriptedProvider(good("m1g2", 1)), repo, energy)
    first = (await repo.index("m1g2"))[0].id
    provider = ScriptedProvider(good("m1g2", 2))
    await run("m1g2", provider, repo, energy, seen={first})
    assert "<case_number>2</case_number>" in provider.requests[0].messages[1].content


# ---- cache hit --------------------------------------------------------------------------
async def test_hit_serves_cached_without_call_or_energy(repo, energy, log_lines) -> None:
    first = await run("m4g1", ScriptedProvider(good("m4g1")), repo, energy)
    provider = ScriptedProvider()  # any call would fail the test
    s = await run_scenario("m4g1", frozenset(), "ffffffffffff", provider=provider, repo=repo, energy=energy)
    assert s.error is None and s.result is not None and s.result.cached is True
    assert s.result.variation_id == first.result.variation_id and s.result.data == first.result.data
    assert provider.requests == []
    assert s.energy is not None and s.energy.remaining == 10  # other device: nothing spent
    assert await energy.global_remaining() == 499  # only the first generation
    m = get_metrics().snapshot()
    assert (m["cache_hits"], m["cache_misses"], m["cache_hit_rate"]) == (1, 1, 0.5)
    assert m["llm_calls_total"] == 1  # a hit is not a provider call
    hit = [x for x in log_lines() if x["event"] == "llm_call" and x["cache"] == "hit"]
    assert len(hit) == 1 and hit[0]["prompt_tokens"] == 0 and hit[0]["model"] == "google/gemini-2.5-flash-lite-001"


async def test_seen_exclusion_then_all_seen_generates(repo, energy) -> None:
    a = (await run("m3g1", ScriptedProvider(good("m3g1", 1)), repo, energy)).result.variation_id
    b = (await run("m3g1", ScriptedProvider(good("m3g1", 2)), repo, energy, seen={a})).result.variation_id
    assert a != b
    hit = await run("m3g1", ScriptedProvider(), repo, energy, seen={b})
    assert hit.result.cached is True and hit.result.variation_id == a
    provider = ScriptedProvider(good("m3g1", 3))
    fresh = await run("m3g1", provider, repo, energy, seen={a, b})
    assert fresh.result.cached is False and fresh.result.variation_id not in {a, b}
    assert len(provider.requests) == 1 and await repo.count("m3g1") == 3


# ---- bounded self-correction ------------------------------------------------------------
async def test_invalid_then_valid_regenerates_once_with_errors_fed_back(repo, energy, log_lines) -> None:
    provider = ScriptedProvider(broken_fibs(), good("m1g2"))
    s = await run("m1g2", provider, repo, energy)
    assert s.error is None and s.result is not None and s.attempt == 2
    assert len(provider.requests) == 2
    feedback = provider.requests[1].messages[1].content
    assert "<validation_errors>" in feedback and "exactly 3 sentences must be fibs (got 4)" in feedback
    assert "<validation_errors>" not in provider.requests[0].messages[1].content
    assert s.energy.remaining == 9 and await energy.global_remaining() == 498  # 1 device, 2 global
    outcomes = [(x["attempt"], x["outcome"]) for x in log_lines() if x["event"] == "llm_call"]
    assert outcomes == [(1, "invalid_output"), (2, "ok")]
    first = next(x for x in log_lines() if x["event"] == "llm_call")
    assert first["validation_errors"] == ["exactly 3 sentences must be fibs (got 4)"]  # rule, no content


async def test_invalid_twice_falls_back_nothing_cached_energy_refunded(repo, energy) -> None:
    provider = ScriptedProvider(broken_fibs(), "not json at all")
    s = await run("m1g2", provider, repo, energy)
    assert s.result is None and s.error is not None and s.error.code == "AI_INVALID_OUTPUT"
    assert len(provider.requests) == 2  # never a third call
    assert await repo.count("m1g2") == 0
    assert s.energy.remaining == 10 and s.error.energy is s.energy
    assert await energy.global_remaining() == 498
    assert get_metrics().snapshot()["llm_calls_by_outcome"] == {"invalid_output": 2}


async def test_max_attempts_one_never_regenerates(repo, energy) -> None:
    provider = ScriptedProvider(broken_fibs())
    s = await run("m1g2", provider, repo, energy, options=ScenarioOptions(max_attempts=1))
    assert s.error.code == "AI_INVALID_OUTPUT" and len(provider.requests) == 1


async def test_no_regeneration_when_deadline_nearly_spent(repo, energy) -> None:
    provider = ScriptedProvider(broken_fibs(), good("m1g2"), delay_s=0.2)
    s = await run("m1g2", provider, repo, energy, options=ScenarioOptions(deadline_s=2.1))
    assert s.error.code == "AI_INVALID_OUTPUT" and len(provider.requests) == 1


async def test_call_timeout_capped_by_remaining_deadline(repo, energy) -> None:
    provider = ScriptedProvider(good("m4g2"))
    await run("m4g2", provider, repo, energy, options=ScenarioOptions(timeout_s=7.0, deadline_s=3.0, max_tokens=650))
    assert provider.requests[0].timeout_s <= 3.0 and provider.requests[0].max_tokens == 650


# ---- moderation / dedupe / store failures -----------------------------------------------
async def test_blocklisted_output_never_cached(repo, energy, log_lines) -> None:
    obj = fake_scenario("m4g2", 1)
    obj["answers"][0]["evidence"] = "Matches shit textbooks"
    provider = ScriptedProvider(json.dumps(obj))
    s = await run("m4g2", provider, repo, energy)
    assert s.error.code == "MODERATED" and await repo.count("m4g2") == 0
    assert s.energy.remaining == 10 and len(provider.requests) == 1  # moderation never regenerates
    line = [x for x in log_lines() if x["event"] == "llm_call"][-1]
    assert line["outcome"] == "moderated" and "Matches" not in json.dumps(line)


async def test_link_in_output_never_cached(repo, energy) -> None:
    obj = fake_scenario("m4g1", 1)
    fake_index = next(i for i, c in enumerate(obj["citations"]) if not c["real"])
    obj["citations"][fake_index]["text"] = "Z. Quinn (2023). Everything AI Can Do. blog.totallytrue.biz"
    s = await run("m4g1", ScriptedProvider(json.dumps(obj)), repo, energy)
    assert s.error.code == "MODERATED" and await repo.count("m4g1") == 0


async def test_duplicate_of_seen_variation_is_an_error(repo, energy) -> None:
    a = (await run("m1g1", ScriptedProvider(good("m1g1")), repo, energy)).result.variation_id
    s = await run("m1g1", ScriptedProvider(good("m1g1")), repo, energy, seen={a})
    assert s.error.code == "AI_INVALID_OUTPUT" and s.energy.remaining == 9  # refunded
    assert await repo.count("m1g1") == 1


async def test_store_failure_falls_back_and_refunds(repo, energy, monkeypatch) -> None:
    async def boom(*_: Any, **__: Any) -> Any:
        raise StoreError("disk full")

    monkeypatch.setattr(repo, "add", boom)
    s = await run("m1g2", ScriptedProvider(good("m1g2")), repo, energy)
    assert s.error.code == "INTERNAL" and s.energy.remaining == 10


SECRET_MSG = "boom-secret-exception-message"


async def _raise_runtime(*_: Any, **__: Any) -> Any:
    raise RuntimeError(SECRET_MSG)


@pytest.mark.parametrize("target", ["moderator", "repo_add"])
async def test_unexpected_exception_logs_internal_error_and_refunds(target, repo, energy, log_lines, monkeypatch) -> None:
    from glitch_api.scenarios import pipeline

    if target == "moderator":
        monkeypatch.setattr(pipeline.moderation, "check", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError(SECRET_MSG)))
    else:
        monkeypatch.setattr(repo, "add", _raise_runtime)
    s = await run("m1g2", ScriptedProvider(good("m1g2")), repo, energy, request_id="req-internal-1")
    assert s.result is None and s.error is not None and s.error.code == "INTERNAL"
    assert s.energy.remaining == 10 and s.error.energy is s.energy  # reserved unit refunded
    assert await repo.count("m1g2") == 0
    lines = log_lines()
    internal = [x for x in lines if x["event"] == "scenario_internal_error"]
    assert len(internal) == 1
    line = internal[0]
    assert line["severity"] == "ERROR"
    assert line["request_id"] == "req-internal-1" and line["game_id"] == "m1g2"
    assert line["error_type"] == "RuntimeError"
    # the provider call itself succeeded: its llm_call line must not blame the provider
    calls = [x for x in lines if x["event"] == "llm_call"]
    assert len(calls) == 1 and calls[0]["outcome"] == "ok" and calls[0]["error_code"] == "INTERNAL"
    raw = json.dumps(lines)
    assert SECRET_MSG not in raw  # never the exception message
    for sentence in fake_scenario("m1g2", 1)["sentences"]:
        assert sentence["text"] not in raw  # never generated text


async def test_unreadable_cache_behaves_as_miss(repo, energy, monkeypatch) -> None:
    async def boom(*_: Any, **__: Any) -> Any:
        raise StoreError("bucket unreachable")

    monkeypatch.setattr(repo, "next_unseen", boom)
    s = await run("m1g2", ScriptedProvider(good("m1g2")), repo, energy)
    assert s.error is None and s.result.cached is False


# ---- provider failures + caps -----------------------------------------------------------
@pytest.mark.parametrize(
    ("exc", "code", "outcome"),
    [
        (LLMTimeoutError("slow"), "AI_TIMEOUT", "timeout"),
        (LLMProviderError("down"), "AI_UNAVAILABLE", "provider_error"),
        (RuntimeError("bug"), "AI_UNAVAILABLE", "provider_error"),
    ],
)
async def test_provider_failure_falls_back_no_retry(exc, code, outcome, repo, energy) -> None:
    provider = ScriptedProvider(exc)
    s = await run("m1g2", provider, repo, energy)
    assert s.error.code == code and len(provider.requests) == 1
    assert s.energy.remaining == 10 and await energy.global_remaining() == 499
    assert get_metrics().snapshot()["llm_calls_by_outcome"] == {outcome: 1}


async def test_device_cap_blocks_generation_but_not_hits(repo, frozen_clock) -> None:
    energy = EnergyService(MemoryCounterStore(), device_cap=1, global_cap=500, clock=frozen_clock)
    await run("m1g2", ScriptedProvider(good("m1g2")), repo, energy)  # uses the only unit
    seen = {(await repo.index("m1g2"))[0].id}
    provider = ScriptedProvider()
    s = await run("m1g2", provider, repo, energy, seen=seen)
    assert s.error.code == "CAP_DEVICE" and provider.requests == [] and s.energy.remaining == 0
    hit = await run("m1g2", provider, repo, energy)  # cached: still served at 0 energy
    assert hit.error is None and hit.result.cached is True


async def test_global_cap_blocks_generation(repo, frozen_clock) -> None:
    energy = EnergyService(MemoryCounterStore(), device_cap=10, global_cap=0, clock=frozen_clock)
    provider = ScriptedProvider()
    s = await run("m1g2", provider, repo, energy)
    assert s.error.code == "CAP_GLOBAL" and provider.requests == [] and s.energy.remaining == 10


async def test_global_cap_reached_before_regeneration(repo, frozen_clock) -> None:
    energy = EnergyService(MemoryCounterStore(), device_cap=10, global_cap=1, clock=frozen_clock)
    provider = ScriptedProvider(broken_fibs(), good("m1g2"))
    s = await run("m1g2", provider, repo, energy)
    assert s.error.code == "CAP_GLOBAL" and len(provider.requests) == 1 and s.energy.remaining == 10


async def test_concurrent_misses_never_overspend_device_energy(repo, frozen_clock) -> None:
    energy = EnergyService(MemoryCounterStore(), device_cap=2, global_cap=500, clock=frozen_clock)
    games = list(GAMES)  # five different games → five cache misses at once
    results = await asyncio.gather(
        *(run(g, ScriptedProvider(good(g), delay_s=0.01), repo, energy) for g in games)
    )
    served = [r for r in results if r.result is not None]
    capped = [r for r in results if r.error is not None and r.error.code == "CAP_DEVICE"]
    assert len(served) == 2 and len(capped) == 3
    assert (await energy.energy(DEVICE)).remaining == 0


# ---- bank mode --------------------------------------------------------------------------
async def test_bank_mode_skips_lookup_and_energy(repo) -> None:
    await run_scenario("m1g2", frozenset(), None, provider=ScriptedProvider(good("m1g2", 1)), repo=repo, energy=None, skip_lookup=True)
    provider = ScriptedProvider(good("m1g2", 2))
    s = await run_scenario("m1g2", frozenset(), None, provider=provider, repo=repo, energy=None, skip_lookup=True)
    assert s.error is None and s.result.cached is False and len(provider.requests) == 1
    assert await repo.count("m1g2") == 2 and s.energy is None
    assert get_metrics().snapshot()["cache_misses"] == 0  # no lookup recorded


async def test_bank_mode_duplicate_reports_existing(repo) -> None:
    kw = {"repo": repo, "energy": None, "skip_lookup": True}
    await run_scenario("m4g1", frozenset(), None, provider=ScriptedProvider(good("m4g1", 1)), **kw)
    s = await run_scenario("m4g1", frozenset(), None, provider=ScriptedProvider(good("m4g1", 1)), **kw)
    assert s.error is None and s.created is False and await repo.count("m4g1") == 1


# ---- privacy ----------------------------------------------------------------------------
async def test_logs_never_carry_seen_ids_or_content(repo, energy, log_lines) -> None:
    seen = {"m1g2-0123456789ab", "m1g2-feedfacecafe"}
    await run("m1g2", ScriptedProvider(good("m1g2")), repo, energy, seen=seen)
    raw = json.dumps(log_lines())
    assert "0123456789ab" not in raw and "feedfacecafe" not in raw
    first_sentence = fake_scenario("m1g2", 1)["sentences"][0]["text"]
    assert first_sentence not in raw


async def test_unknown_game_raises(repo, energy) -> None:
    with pytest.raises(KeyError):
        await run("m2g1", ScriptedProvider(), repo, energy)

