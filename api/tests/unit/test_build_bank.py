"""Bank script (``tools/build_bank.py``) — spec/capabilities/variation-bank.md.

Fake provider + local store + in-memory fake GCS: shortfall logic, idempotent rerun,
rejection path (validation / moderation / duplicate), network retry with backoff,
max-calls guard, dry-run makes no calls, ``all``, demo-provider refusal, store abort,
summary lines, exit codes, and logs that never carry generated text.
"""

from __future__ import annotations

import io
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from glitch_api.config import Settings
from glitch_api.llm.base import (
    LLMAuthError,
    LLMProviderError,
    LLMRequest,
    LLMResult,
    LLMTimeoutError,
)
from glitch_api.llm.fake import FakeProvider
from glitch_api.scenarios.fake_gen import fake_scenario, fake_scenario_from_prompt
from glitch_api.scenarios.repository import (
    DEMO_NAMESPACE,
    NAMESPACE,
    ScenarioRepository,
)
from glitch_api.scenarios.schemas import GAME_IDS, parse_candidate
from glitch_api.store import LocalBlobStore, StoreError
from glitch_api.store.fake_gcs import FakeGcsClient
from glitch_api.store.gcs import GcsBlobStore
from glitch_api.tools import build_bank as bank


class ScriptedProvider:
    """A 'real' (openrouter-named) provider whose outputs are scripted per call.

    Each item: ``"fake"`` = a valid demo case file for the prompt, a str = raw content,
    an Exception = raised. When the script runs out it keeps answering ``"fake"``.
    """

    name = "openrouter"
    model = "google/gemini-2.5-flash-lite"

    def __init__(self, *outputs: str | Exception) -> None:
        self.outputs = list(outputs)
        self.requests: list[LLMRequest] = []

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.requests.append(request)
        item = self.outputs.pop(0) if self.outputs else "fake"
        if isinstance(item, Exception):
            raise item
        user = "\n".join(m.content for m in request.messages if m.role == "user")
        text = fake_scenario_from_prompt(user) if item == "fake" else item
        return LLMResult(
            text=text,
            provider="openrouter",
            model_requested=self.model,
            model_used=self.model,
            prompt_tokens=100,
            completion_tokens=50,
            latency_ms=1.0,
        )

    async def aclose(self) -> None:
        return None


def no_sleep() -> tuple[list[float], Callable[[float], Any]]:
    slept: list[float] = []

    async def _sleep(seconds: float) -> None:
        slept.append(seconds)

    return slept, _sleep


@pytest.fixture
def repo(tmp_path: Path) -> ScenarioRepository:
    return ScenarioRepository(LocalBlobStore(tmp_path / "cache"), NAMESPACE)


async def seed(
    repo: ScenarioRepository, case_number: int, game_id: str = "m1g2"
) -> None:
    await repo.add(
        game_id,
        parse_candidate(game_id, fake_scenario(game_id, case_number)),
        model="seed",
    )


def bank_settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "cache_dir": str(tmp_path / "cache"),
        "llm_provider": "fake",
        **overrides,
    }
    return Settings(_env_file=None, **values)


def run_main(argv: list[str], **kwargs: Any) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    code = bank.main(argv, out=out, err=err, **kwargs)
    return code, out.getvalue(), err.getvalue()


# ---- build_bank(): shortfall + idempotency ------------------------------------------------
async def test_generates_only_the_shortfall(repo: ScenarioRepository) -> None:
    await seed(repo, 1)
    provider = ScriptedProvider()
    report = await bank.build_bank(["m1g2"], 3, provider=provider, repo=repo)
    game = report.games[0]
    assert (game.generated, game.already_present, len(game.rejected)) == (2, 1, 0)
    assert len(provider.requests) == 2  # one batched call per variation
    assert await repo.count("m1g2") == 3
    assert (
        report.calls == 2
        and report.prompt_tokens == 200
        and report.completion_tokens == 100
    )
    assert game.summary() == "m1g2: 2 generated, 1 already present, 0 rejected"


async def test_rerun_with_same_count_generates_nothing(
    repo: ScenarioRepository,
) -> None:
    provider = ScriptedProvider()
    first = await bank.build_bank(["m1g2"], 3, provider=provider, repo=repo)
    assert first.games[0].generated == 3
    calls_after_first = len(provider.requests)
    second = await bank.build_bank(["m1g2"], 3, provider=provider, repo=repo)
    assert (
        second.games[0].summary() == "m1g2: 0 generated, 3 already present, 0 rejected"
    )
    assert len(provider.requests) == calls_after_first  # zero provider calls
    # stored objects are full, validated variations
    ids = [e.id for e in await repo.index("m1g2")]
    assert len(set(ids)) == 3
    for vid in ids:
        assert (await repo.get("m1g2", vid)) is not None


async def test_more_present_than_target_is_a_noop(repo: ScenarioRepository) -> None:
    for n in (1, 2, 3):
        await seed(repo, n)
    provider = ScriptedProvider()
    report = await bank.build_bank(["m1g2"], 2, provider=provider, repo=repo)
    assert (
        report.games[0].summary() == "m1g2: 0 generated, 3 already present, 0 rejected"
    )
    assert provider.requests == []


async def test_all_games(repo: ScenarioRepository) -> None:
    provider = ScriptedProvider()
    report = await bank.build_bank(list(GAME_IDS), 2, provider=provider, repo=repo)
    assert [g.game_id for g in report.games] == list(GAME_IDS)
    assert all(g.generated == 2 for g in report.games)
    assert len(provider.requests) == 2 * len(GAME_IDS)
    for gid in GAME_IDS:
        assert await repo.count(gid) == 2
    assert report.ok


# ---- rejection path -----------------------------------------------------------------------
async def test_invalid_twice_is_rejected_with_reason_and_not_stored(
    repo: ScenarioRepository,
) -> None:
    bad = json.dumps({"sentences": []})
    provider = ScriptedProvider(
        bad, bad
    )  # first try + the one validator-fed regeneration
    report = await bank.build_bank(["m1g2"], 1, provider=provider, repo=repo)
    game = report.games[0]
    assert (game.generated, len(game.rejected)) == (0, 1)
    assert "validation" in game.rejected[0]
    assert await repo.count("m1g2") == 0
    assert len(provider.requests) == 2
    assert game.summary() == "m1g2: 0 generated, 0 already present, 1 rejected"
    assert report.ok  # a rejection is reported, not an error


async def test_invalid_then_valid_uses_regeneration(repo: ScenarioRepository) -> None:
    provider = ScriptedProvider("not json at all", "fake")
    report = await bank.build_bank(["m1g2"], 1, provider=provider, repo=repo)
    assert report.games[0].generated == 1
    assert len(provider.requests) == 2


async def test_moderated_output_is_rejected(repo: ScenarioRepository) -> None:
    data = fake_scenario("m1g2", 1)
    data["sentences"][0]["text"] = "Read more at https://example.com today."
    provider = ScriptedProvider(json.dumps(data))
    report = await bank.build_bank(["m1g2"], 1, provider=provider, repo=repo)
    game = report.games[0]
    assert len(game.rejected) == 1 and "link" in game.rejected[0]
    assert await repo.count("m1g2") == 0


async def test_duplicate_of_existing_variation_is_rejected(
    repo: ScenarioRepository,
) -> None:
    await seed(repo, 1)
    provider = ScriptedProvider(json.dumps(fake_scenario("m1g2", 1)))
    report = await bank.build_bank(["m1g2"], 2, provider=provider, repo=repo)
    game = report.games[0]
    assert (game.generated, game.already_present, len(game.rejected)) == (0, 1, 1)
    assert "duplicate" in game.rejected[0]
    assert await repo.count("m1g2") == 1


# ---- network retries ------------------------------------------------------------------------
async def test_transient_errors_are_retried_with_backoff(
    repo: ScenarioRepository,
) -> None:
    slept, sleep = no_sleep()
    provider = ScriptedProvider(
        LLMTimeoutError("slow"), LLMProviderError("503"), "fake"
    )
    report = await bank.build_bank(
        ["m1g2"], 1, provider=provider, repo=repo, sleep=sleep
    )
    assert report.games[0].generated == 1
    assert len(provider.requests) == 3
    assert slept == [bank.BACKOFF_BASE_S, bank.BACKOFF_BASE_S * 2]


async def test_retries_exhausted_records_rejection_and_continues(
    repo: ScenarioRepository,
) -> None:
    slept, sleep = no_sleep()
    errors = [LLMProviderError("503") for _ in range(1 + bank.NETWORK_RETRIES)]
    provider = ScriptedProvider(*errors, "fake")
    report = await bank.build_bank(
        ["m1g2"], 2, provider=provider, repo=repo, sleep=sleep
    )
    game = report.games[0]
    assert (game.generated, len(game.rejected)) == (1, 1)
    assert "unavailable" in game.rejected[0]
    assert len(slept) == bank.NETWORK_RETRIES


async def test_auth_error_aborts_the_game_with_an_error(
    repo: ScenarioRepository,
) -> None:
    slept, sleep = no_sleep()
    provider = ScriptedProvider(
        LLMAuthError(
            "OpenRouter key rejected — check GLITCH_OPENROUTER_API_KEY in .env"
        )
    )
    report = await bank.build_bank(
        ["m1g2", "m1g1"], 2, provider=provider, repo=repo, sleep=sleep
    )
    assert len(provider.requests) == 1  # no retry on a rejected key, no further games
    assert report.games[0].error is not None and "key rejected" in report.games[0].error
    assert not report.ok
    assert slept == []


# ---- budget guard ---------------------------------------------------------------------------
async def test_max_calls_guard_stops_generation(repo: ScenarioRepository) -> None:
    provider = ScriptedProvider()
    report = await bank.build_bank(
        ["m1g2", "m1g1"], 3, provider=provider, repo=repo, max_calls=2
    )
    assert len(provider.requests) == 2
    m1g2, m1g1 = report.games
    assert m1g2.generated == 2 and m1g2.error is not None and "max-calls" in m1g2.error
    assert m1g1.generated == 0 and m1g1.error is not None
    assert not report.ok
    assert await repo.count("m1g2") == 2


async def test_max_calls_limits_the_regeneration_attempt(
    repo: ScenarioRepository,
) -> None:
    provider = ScriptedProvider("not json")
    report = await bank.build_bank(
        ["m1g2"], 1, provider=provider, repo=repo, max_calls=1
    )
    assert len(provider.requests) == 1  # the regeneration would exceed the budget
    assert len(report.games[0].rejected) == 1


async def test_max_calls_counts_retries(repo: ScenarioRepository) -> None:
    slept, sleep = no_sleep()
    provider = ScriptedProvider(*[LLMProviderError("503") for _ in range(10)])
    report = await bank.build_bank(
        ["m1g2"], 1, provider=provider, repo=repo, max_calls=2, sleep=sleep
    )
    assert len(provider.requests) == 2
    assert not report.ok


# ---- dry run -------------------------------------------------------------------------------
async def test_dry_run_makes_no_calls_and_writes_nothing(
    repo: ScenarioRepository, tmp_path: Path
) -> None:
    await seed(repo, 1)
    before = sorted(p.relative_to(tmp_path) for p in (tmp_path / "cache").rglob("*"))
    provider = ScriptedProvider()
    report = await bank.build_bank(
        ["m1g2", "m1g1"], 3, provider=provider, repo=repo, dry_run=True
    )
    assert provider.requests == []
    assert [g.planned for g in report.games] == [2, 3]
    assert (
        report.games[0].summary()
        == "m1g2: dry run — would generate 2, 1 already present, 0 rejected"
    )
    after = sorted(p.relative_to(tmp_path) for p in (tmp_path / "cache").rglob("*"))
    assert before == after


# ---- logs ----------------------------------------------------------------------------------
async def test_logs_never_contain_generated_text(
    repo: ScenarioRepository, capsys: pytest.CaptureFixture[str]
) -> None:
    from glitch_api.logging import configure_logging

    configure_logging("INFO")
    data = fake_scenario("m1g2", 1)
    secret_sentence = "Visit https://example.com for the zebra secret."
    data["sentences"][0]["text"] = secret_sentence
    provider = ScriptedProvider(json.dumps(data), "fake")
    await bank.build_bank(["m1g2"], 2, provider=provider, repo=repo)
    lines = [
        json.loads(line)
        for line in capsys.readouterr().out.splitlines()
        if line.startswith("{")
    ]
    events = [line["event"] for line in lines]
    assert "bank_variation" in events and "bank_game" in events
    blob = "\n".join(json.dumps(line) for line in lines)
    assert "zebra" not in blob
    for sentence in fake_scenario("m1g2", 2)["sentences"]:
        assert sentence["text"] not in blob


# ---- CLI (main) ----------------------------------------------------------------------------
def test_cli_local_rerun_prints_already_present(tmp_path: Path) -> None:
    settings = bank_settings(tmp_path)
    provider = ScriptedProvider()
    code, out, _ = run_main(
        ["--game", "m1g2", "--count", "3"], settings=settings, provider=provider
    )
    assert code == 0, out
    assert "m1g2: 3 generated, 0 already present, 0 rejected" in out
    assert "calls: 3" in out and "est. cost" in out
    code, out, _ = run_main(
        ["--game", "m1g2", "--count", "3"], settings=settings, provider=provider
    )
    assert code == 0
    assert "m1g2: 0 generated, 3 already present, 0 rejected" in out
    assert len(provider.requests) == 3
    # real-provider output goes to the live namespace, under the configured cache dir
    assert (tmp_path / "cache" / NAMESPACE / "m1g2" / "index.json").exists()


def test_cli_cache_dir_flag_overrides_settings(tmp_path: Path) -> None:
    settings = bank_settings(tmp_path)
    other = tmp_path / "other"
    code, out, _ = run_main(
        ["--game", "m1g1", "--count", "1", "--cache-dir", str(other)],
        settings=settings,
        provider=ScriptedProvider(),
    )
    assert code == 0, out
    assert (other / NAMESPACE / "m1g1" / "index.json").exists()
    assert not (tmp_path / "cache").exists()


def test_cli_gcs_backend_with_fake_client(tmp_path: Path) -> None:
    client = FakeGcsClient()
    settings = bank_settings(tmp_path, gcs_bucket="glitch-bank-test")
    argv = ["--game", "m1g2", "--count", "3", "--backend", "gcs"]
    provider = ScriptedProvider()
    code, out, _ = run_main(
        argv, settings=settings, provider=provider, gcs_client=client
    )
    assert code == 0, out
    assert "m1g2: 3 generated, 0 already present, 0 rejected" in out
    code, out, _ = run_main(
        argv, settings=settings, provider=provider, gcs_client=client
    )
    assert "m1g2: 0 generated, 3 already present, 0 rejected" in out
    names = sorted(client.buckets["glitch-bank-test"])
    assert f"{NAMESPACE}/m1g2/index.json" in names and len(names) == 4
    assert not (tmp_path / "cache").exists()  # nothing written locally


def test_cli_gcs_without_bucket_is_a_clear_error(tmp_path: Path) -> None:
    code, _, err = run_main(
        ["--game", "m1g2", "--backend", "gcs"],
        settings=bank_settings(tmp_path),
        provider=ScriptedProvider(),
    )
    assert code == 2
    assert "GLITCH_GCS_BUCKET" in err


def test_cli_all_games(tmp_path: Path) -> None:
    provider = ScriptedProvider()
    code, out, _ = run_main(
        ["--game", "all", "--count", "1"],
        settings=bank_settings(tmp_path),
        provider=provider,
    )
    assert code == 0, out
    for gid in GAME_IDS:
        assert f"{gid}: 1 generated, 0 already present, 0 rejected" in out
    assert len(provider.requests) == len(GAME_IDS)


def test_cli_refuses_demo_provider_without_dry_run(tmp_path: Path) -> None:
    code, out, err = run_main(
        ["--game", "m1g2", "--count", "1"], settings=bank_settings(tmp_path)
    )
    assert code == 2
    assert "demo provider" in err
    assert not (tmp_path / "cache").exists()


def test_cli_dry_run_with_demo_provider_writes_nothing(tmp_path: Path) -> None:
    code, out, _ = run_main(
        ["--game", "all", "--count", "3", "--dry-run"], settings=bank_settings(tmp_path)
    )
    assert code == 0, out
    assert "m1g2: dry run — would generate 3, 0 already present, 0 rejected" in out
    assert not (tmp_path / "cache").exists()


def test_cli_allow_demo_writes_to_the_demo_namespace(tmp_path: Path) -> None:
    code, out, _ = run_main(
        ["--game", "m1g2", "--count", "2", "--allow-demo"],
        settings=bank_settings(tmp_path),
    )
    assert code == 0, out
    assert "m1g2: 2 generated, 0 already present, 0 rejected" in out
    assert (tmp_path / "cache" / DEMO_NAMESPACE / "m1g2" / "index.json").exists()
    assert not (tmp_path / "cache" / NAMESPACE).exists()


def test_cli_provider_flag_selects_fake(tmp_path: Path) -> None:
    settings = bank_settings(
        tmp_path, llm_provider="auto", openrouter_api_key="sk-test-not-real"
    )
    code, _, err = run_main(["--game", "m1g2", "--provider", "fake"], settings=settings)
    assert code == 2 and "demo provider" in err


def test_cli_openrouter_without_key_is_a_clear_error(tmp_path: Path) -> None:
    code, _, err = run_main(
        ["--game", "m1g2", "--provider", "openrouter"], settings=bank_settings(tmp_path)
    )
    assert code == 2
    assert "GLITCH_OPENROUTER_API_KEY" in err


@pytest.mark.parametrize(
    "argv",
    [
        ["--game", "nope"],
        ["--game", "m1g2", "--count", "0"],
        ["--game", "m1g2", "--count", str(bank.MAX_COUNT + 1)],
        ["--game", "m1g2", "--max-calls", "0"],
        ["--count", "3"],
    ],
)
def test_cli_rejects_bad_arguments(tmp_path: Path, argv: list[str]) -> None:
    code, _, _ = run_main(
        argv, settings=bank_settings(tmp_path), provider=ScriptedProvider()
    )
    assert code == 2


def test_cli_exit_nonzero_when_a_game_errors(tmp_path: Path) -> None:
    provider = ScriptedProvider()
    code, out, _ = run_main(
        ["--game", "m1g2", "--count", "3", "--max-calls", "1"],
        settings=bank_settings(tmp_path),
        provider=provider,
    )
    assert code == 1
    assert "m1g2: 1 generated, 0 already present, 0 rejected" in out
    assert "max-calls" in out


def test_cli_store_failure_aborts_with_clear_message(tmp_path: Path) -> None:
    client = FakeGcsClient()
    from google.api_core import exceptions as gexc

    client.fail_next = gexc.ServiceUnavailable("down")
    settings = bank_settings(tmp_path, gcs_bucket="b")
    provider = ScriptedProvider()
    code, out, _ = run_main(
        ["--game", "all", "--count", "1", "--backend", "gcs"],
        settings=settings,
        provider=provider,
        gcs_client=client,
    )
    assert code == 1
    assert "blob cache" in out
    assert provider.requests == []
    assert out.count("error") >= 1


def test_default_count_and_max_are_small() -> None:
    args = bank.parse_args(["--game", "m1g2"])
    assert args.count == bank.DEFAULT_COUNT == 3
    assert args.max_calls == bank.DEFAULT_MAX_CALLS
    assert bank.MAX_COUNT == 100


async def test_store_error_during_count_marks_game_error(tmp_path: Path) -> None:
    class Broken(ScenarioRepository):
        async def count(self, game_id: str) -> int:
            raise StoreError("disk gone")

    repo = Broken(LocalBlobStore(tmp_path / "c"), NAMESPACE)
    report = await bank.build_bank(
        ["m1g2", "m1g1"], 1, provider=ScriptedProvider(), repo=repo
    )
    assert report.games[0].error is not None and "blob cache" in report.games[0].error
    later = report.games[1]  # abort: later games are reported but not attempted
    assert (
        later.error is not None
        and later.error.startswith("not attempted")
        and later.generated == 0
    )
    assert not report.ok


def test_gcs_store_type_used(tmp_path: Path) -> None:
    store = bank.make_store(
        bank_settings(tmp_path, gcs_bucket="b", blob_backend="gcs"),
        gcs_client=FakeGcsClient(),
    )
    assert isinstance(store, GcsBlobStore)
    _ = FakeProvider  # demo provider is the default for isolated settings
