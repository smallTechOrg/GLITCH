"""Pre-build the case-file bank — spec/capabilities/variation-bank.md, spec/agent.md (Composition 2).

    cd api && uv run python -m glitch_api.tools.build_bank --game m1g2 --count 3
    cd api && uv run python -m glitch_api.tools.build_bank --game all --count 5 --backend gcs
    cd api && uv run python -m glitch_api.tools.build_bank --game all --count 5 --dry-run

``--count N`` is the TARGET number of variations present per game: only the shortfall is
generated, so re-running with the same N generates 0 (idempotent). Every candidate goes
through the same pipeline as live generation — ``run_scenario(..., energy=None,
skip_lookup=True)``: one batched call → schema + domain validation (one validator-fed
regeneration) → moderation → dedupe (content hash) → store. A candidate identical to a
cached one is reported as a rejected duplicate.

Budget: bank calls consume no device energy and are NOT charged to the server's daily
global ceiling (``GLITCH_GLOBAL_DAILY_CAP``) — they count against nothing but the admin's
OpenRouter key (spec: "counts against nothing but the admin's OpenRouter key"). The
spend guard here is ``--max-calls`` (default 20 provider calls per run, retries and
regenerations included); generation stops when it is reached and the run exits 1.

Network failures (timeout / 5xx / 429) are retried up to 3 times with exponential
backoff, then recorded as rejected and the run continues. A rejected key, missing model,
or exhausted credits aborts the run. A blob-cache failure aborts with a clear message.
Sequential (concurrency 1) to stay inside cheap rate limits.

Refuses the demo provider unless ``--dry-run`` (or ``--allow-demo``, which writes demo
case files into the separate ``scenarios-demo`` namespace — dev/test only).

Output (stdout): one ``<game>: N generated, M already present, K rejected`` line per game
(rejection reasons indented beneath), then a calls / tokens / est. cost line. Structured
JSON logs go to stderr (and ``GLITCH_LOG_FILE``); they never contain generated text or
secrets. Exit 0 = every game reached its target or reported only rejections; 1 = a game
errored (budget reached, blob cache failure, fatal provider error); 2 = bad usage/config.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import sys
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any

from glitch_api.config import ConfigError, Settings
from glitch_api.llm.base import (
    LLMError,
    LLMProvider,
    LLMProviderError,
    LLMRequest,
    LLMResult,
)
from glitch_api.llm.factory import build_provider
from glitch_api.logging import configure_logging, get_logger
from glitch_api.scenarios import namespace_for
from glitch_api.scenarios.pipeline import ScenarioOptions, new_request_id, run_scenario
from glitch_api.scenarios.repository import ScenarioRepository
from glitch_api.scenarios.schemas import GAME_IDS
from glitch_api.store import BlobStore, StoreError, build_store

DEFAULT_COUNT = 3
MAX_COUNT = 100  # spec: Count N is an integer 1–100
DEFAULT_MAX_CALLS = (
    20  # hard spend guard per run (provider calls, incl. retries/regenerations)
)
NETWORK_RETRIES = 3
BACKOFF_BASE_S = 2.0
# Offline: no learner is waiting, so allow slower (cheaper, rate-limited) responses.
BANK_TIMEOUT_S = 30.0
BANK_DEADLINE_S = 70.0
FATAL_STATUSES = frozenset(
    {401, 402, 403, 404}
)  # key rejected / no credits / unknown model

# USD per 1M tokens (input, output) for the configured slugs — an ESTIMATE for the report.
PRICES_PER_M: dict[str, tuple[float, float]] = {
    "google/gemini-2.5-flash-lite": (0.10, 0.40),
    "openai/gpt-4o-mini": (0.15, 0.60),
    "glitch/demo-nova": (0.0, 0.0),
}

Sleep = Callable[[float], Awaitable[None]]


class BudgetExhausted(LLMProviderError):
    """Raised by the counting wrapper if a call would exceed ``--max-calls`` (never sent)."""


# ---- provider wrapper: counts every real call, hard-stops at the budget ------------------
class CountingProvider:
    def __init__(self, inner: LLMProvider, max_calls: int) -> None:
        self.inner = inner
        self.name = inner.name
        self.model = inner.model
        self.max_calls = max_calls
        self.calls = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.cost_usd: float | None = 0.0
        self.last_error: LLMError | None = None

    @property
    def remaining(self) -> int:
        return max(0, self.max_calls - self.calls)

    async def complete(self, request: LLMRequest) -> LLMResult:
        self.last_error = None
        if self.calls >= self.max_calls:
            self.last_error = BudgetExhausted("max-calls budget reached")
            raise self.last_error
        self.calls += 1
        try:
            result = await self.inner.complete(request)
        except LLMError as exc:
            self.last_error = exc
            raise
        self.prompt_tokens += result.prompt_tokens
        self.completion_tokens += result.completion_tokens
        price = PRICES_PER_M.get(result.model_used)
        if price is None or self.cost_usd is None:
            self.cost_usd = None  # unknown model price → no estimate
        else:
            self.cost_usd += (
                result.prompt_tokens * price[0] + result.completion_tokens * price[1]
            ) / 1_000_000
        return result

    async def aclose(self) -> None:
        await self.inner.aclose()


# ---- report -----------------------------------------------------------------------------
@dataclass
class GameReport:
    game_id: str
    target: int
    already_present: int = 0
    generated: int = 0
    rejected: list[str] = field(default_factory=list)
    planned: int = 0  # dry run: how many would be generated
    dry_run: bool = False
    error: str | None = None

    def summary(self) -> str:
        if self.dry_run:
            head = f"dry run — would generate {self.planned}"
        else:
            head = f"{self.generated} generated"
        return f"{self.game_id}: {head}, {self.already_present} already present, {len(self.rejected)} rejected"


@dataclass
class BankReport:
    games: list[GameReport] = field(default_factory=list)
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float | None = 0.0
    aborted: str | None = None

    @property
    def ok(self) -> bool:
        return self.aborted is None and all(g.error is None for g in self.games)

    def usage_line(self) -> str:
        cost = (
            "unknown (model price not listed)"
            if self.cost_usd is None
            else f"${self.cost_usd:.4f}"
        )
        return (
            f"calls: {self.calls}, tokens: {self.prompt_tokens} prompt + {self.completion_tokens} completion, "
            f"est. cost: {cost}"
        )


class _Fatal(Exception):
    """Stop the whole run (message is safe to print)."""


# ---- core -------------------------------------------------------------------------------
async def _one_variation(
    game_id: str,
    *,
    provider: CountingProvider,
    repo: ScenarioRepository,
    options: ScenarioOptions,
    sleep: Sleep,
) -> tuple[bool, str | None]:
    """Generate ONE variation (with network retries). Returns (stored_new, rejection_reason).

    Raises ``_Fatal`` for budget exhaustion, fatal provider errors and store failures.
    """
    log = get_logger()
    tries = 0
    while True:
        if provider.remaining <= 0:
            raise _Fatal(f"max-calls budget reached ({provider.max_calls} calls)")
        tries += 1
        request_id = new_request_id()
        opts = ScenarioOptions(
            max_tokens=options.max_tokens,
            temperature=options.temperature,
            timeout_s=options.timeout_s,
            deadline_s=options.deadline_s,
            max_attempts=max(1, min(options.max_attempts, provider.remaining)),
        )
        state = await run_scenario(
            game_id,
            frozenset(),
            None,
            provider=provider,
            repo=repo,
            energy=None,
            options=opts,
            request_id=request_id,
            skip_lookup=True,
        )
        if state.error is None:
            assert state.stored is not None
            if state.created:
                log.info(
                    "bank_variation",
                    request_id=request_id,
                    game_id=game_id,
                    outcome="stored",
                    variation_id=state.stored.id,
                )
                return True, None
            reason = f"duplicate of cached case file {state.stored.id}"
            log.warning(
                "bank_variation",
                request_id=request_id,
                game_id=game_id,
                outcome="rejected",
                reason=reason,
            )
            return False, reason

        code = state.error.code
        last = provider.last_error
        if isinstance(last, BudgetExhausted):
            raise _Fatal(f"max-calls budget reached ({provider.max_calls} calls)")
        if code == "INTERNAL":
            log.error(
                "bank_variation",
                request_id=request_id,
                game_id=game_id,
                outcome="error",
                error_code=code,
            )
            raise _Fatal(
                "blob cache write failed — check the cache dir / bucket and credentials"
            )
        if last is not None and (
            last.status in FATAL_STATUSES
            or type(last).__name__ in {"LLMAuthError", "LLMModelNotFoundError"}
        ):
            log.error(
                "bank_variation",
                request_id=request_id,
                game_id=game_id,
                outcome="error",
                error_code=code,
            )
            raise _Fatal(f"provider refused the call: {last.message}")
        if code in ("AI_TIMEOUT", "AI_UNAVAILABLE"):
            if tries <= NETWORK_RETRIES:
                delay = BACKOFF_BASE_S * (2 ** (tries - 1))
                log.warning(
                    "bank_retry",
                    request_id=request_id,
                    game_id=game_id,
                    error_code=code,
                    attempt=tries,
                    backoff_s=delay,
                )
                await sleep(delay)
                continue
            kind = "timeout" if code == "AI_TIMEOUT" else "provider error"
            reason = f"AI unavailable after {tries} tries ({kind})"
        elif state.errors:
            shown = "; ".join(state.errors[:3]) + (
                " …" if len(state.errors) > 3 else ""
            )
            reason = f"failed validation after {state.attempt} attempt(s): {shown}"
        elif code == "MODERATED":
            reason = state.detail or "blocked by output filter"
        else:
            reason = state.detail or f"rejected ({code})"
        log.warning(
            "bank_variation",
            request_id=request_id,
            game_id=game_id,
            outcome="rejected",
            error_code=code,
            reason=reason,
        )
        return False, reason


def _skip_rest(
    report: BankReport, games: Sequence[str], current: str, count: int, why: str
) -> None:
    """The budget / key / cache problem applies to every remaining game too."""
    for rest in list(games)[list(games).index(current) + 1 :]:
        report.games.append(GameReport(rest, count, error=f"not attempted: {why}"))


class _EmptyRepository(ScenarioRepository):
    """Dry run against a local cache dir that does not exist yet: 0 present, nothing touched."""

    async def count(self, game_id: str) -> int:
        self._require_game(game_id)
        return 0


async def build_bank(
    games: Sequence[str],
    count: int,
    *,
    provider: LLMProvider,
    repo: ScenarioRepository,
    max_calls: int = DEFAULT_MAX_CALLS,
    dry_run: bool = False,
    options: ScenarioOptions | None = None,
    sleep: Sleep = asyncio.sleep,
) -> BankReport:
    """Bring every game in ``games`` up to ``count`` stored variations (sequentially)."""
    options = options or ScenarioOptions(
        timeout_s=BANK_TIMEOUT_S, deadline_s=BANK_DEADLINE_S
    )
    counting = CountingProvider(provider, max_calls)
    report = BankReport()
    log = get_logger()
    try:
        for game_id in games:
            game = GameReport(game_id, count, dry_run=dry_run)
            report.games.append(game)
            try:
                game.already_present = await repo.count(game_id)
            except StoreError as exc:
                game.error = f"blob cache read failed ({exc}) — aborting"
                report.aborted = game.error
                log.error(
                    "bank_game",
                    game_id=game_id,
                    outcome="error",
                    error="blob cache read failed",
                )
                _skip_rest(report, games, game_id, count, game.error)
                break
            shortfall = max(0, count - game.already_present)
            if dry_run:
                game.planned = shortfall
                log.info(
                    "bank_game",
                    game_id=game_id,
                    outcome="dry_run",
                    target=count,
                    present=game.already_present,
                    planned=shortfall,
                )
                continue
            try:
                for _ in range(shortfall):
                    stored, reason = await _one_variation(
                        game_id,
                        provider=counting,
                        repo=repo,
                        options=options,
                        sleep=sleep,
                    )
                    if stored:
                        game.generated += 1
                    else:
                        assert reason is not None
                        game.rejected.append(reason)
            except _Fatal as exc:
                game.error = str(exc)
                report.aborted = game.error
            log.info(
                "bank_game",
                game_id=game_id,
                outcome="error" if game.error else "ok",
                target=count,
                present=game.already_present,
                generated=game.generated,
                rejected=len(game.rejected),
                calls=counting.calls,
            )
            if report.aborted:
                _skip_rest(report, games, game_id, count, report.aborted)
                break
    finally:
        report.calls = counting.calls
        report.prompt_tokens = counting.prompt_tokens
        report.completion_tokens = counting.completion_tokens
        report.cost_usd = counting.cost_usd
    return report


# ---- CLI --------------------------------------------------------------------------------
class _Parser(argparse.ArgumentParser):
    def error(
        self, message: str
    ) -> Any:  # exit 2 without argparse's SystemExit in tests
        raise _UsageError(message)


class _UsageError(Exception):
    pass


def _count(value: str) -> int:
    n = int(value)
    if not 1 <= n <= MAX_COUNT:
        raise argparse.ArgumentTypeError(f"--count must be between 1 and {MAX_COUNT}")
    return n


def _positive(value: str) -> int:
    n = int(value)
    if n < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return n


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    p = _Parser(
        prog="python -m glitch_api.tools.build_bank",
        description="Pre-build the scenario variation bank.",
    )
    p.add_argument(
        "--game",
        required=True,
        choices=[*GAME_IDS, "all"],
        help="content game id, or 'all'",
    )
    p.add_argument(
        "--count",
        type=_count,
        default=DEFAULT_COUNT,
        help=f"target variations per game (1–{MAX_COUNT}, default {DEFAULT_COUNT})",
    )
    p.add_argument(
        "--backend",
        choices=["local", "gcs"],
        default=None,
        help="blob backend (default: GLITCH_BLOB_BACKEND)",
    )
    p.add_argument(
        "--cache-dir", default=None, help="local cache dir (default: GLITCH_CACHE_DIR)"
    )
    p.add_argument(
        "--bucket", default=None, help="GCS bucket (default: GLITCH_GCS_BUCKET)"
    )
    p.add_argument(
        "--provider",
        choices=["auto", "openrouter", "fake"],
        default=None,
        help="default: GLITCH_LLM_PROVIDER",
    )
    p.add_argument(
        "--max-calls",
        type=_positive,
        default=DEFAULT_MAX_CALLS,
        help=f"provider-call budget for this run (default {DEFAULT_MAX_CALLS})",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="report the shortfall only: no provider calls, no writes",
    )
    p.add_argument(
        "--allow-demo",
        action="store_true",
        help="dev/test: let the demo provider write to the demo namespace",
    )
    return p.parse_args(list(argv) if argv is not None else None)


def effective_settings(base: Settings, args: argparse.Namespace) -> Settings:
    update: dict[str, Any] = {}
    if args.backend:
        update["blob_backend"] = args.backend
    if args.cache_dir:
        update["cache_dir"] = str(Path(args.cache_dir).expanduser().resolve())
    if args.bucket:
        update["gcs_bucket"] = args.bucket
    if args.provider:
        update["llm_provider"] = args.provider
    return base.model_copy(update=update)


def make_store(settings: Settings, *, gcs_client: Any | None = None) -> BlobStore:
    if settings.blob_backend == "gcs" and not settings.gcs_bucket:
        raise ConfigError(
            "--backend gcs needs a bucket: set GLITCH_GCS_BUCKET in .env or pass --bucket"
        )
    return build_store(settings, gcs_client=gcs_client)


def main(
    argv: Sequence[str] | None = None,
    *,
    settings: Settings | None = None,
    provider: LLMProvider | None = None,
    gcs_client: Any | None = None,
    out: IO[str] | None = None,
    err: IO[str] | None = None,
) -> int:
    out = out or sys.stdout
    err = err or sys.stderr
    try:
        args = parse_args(argv)
    except _UsageError as exc:
        print(f"usage error: {exc}", file=err)
        return 2
    try:
        cfg = effective_settings(settings or Settings(), args)
        if cfg.llm_provider == "openrouter" and not cfg.has_openrouter_key:
            raise ConfigError(
                "--provider openrouter but GLITCH_OPENROUTER_API_KEY is missing — add it to .env"
            )
        llm = provider or build_provider(cfg)
        if llm.name == "fake" and not (args.dry_run or args.allow_demo):
            raise ConfigError(
                "refusing to build the bank with the demo provider (no GLITCH_OPENROUTER_API_KEY / "
                "GLITCH_LLM_PROVIDER=fake) — add the key, or use --dry-run"
            )
        store = make_store(cfg, gcs_client=gcs_client)
    except (ConfigError, StoreError) as exc:
        print(f"config error: {exc}", file=err)
        return 2

    games = list(GAME_IDS) if args.game == "all" else [args.game]
    repo = ScenarioRepository(store, namespace_for(llm))
    if args.dry_run and cfg.blob_backend == "local" and not cfg.cache_path.exists():
        repo = _EmptyRepository(
            store, repo.namespace
        )  # never create the dir on a dry run
    target = cfg.gcs_bucket if cfg.blob_backend == "gcs" else str(cfg.cache_path)
    print(
        f"bank: games={','.join(games)} target={args.count} backend={cfg.blob_backend} ({target}) "
        f"namespace={repo.namespace} provider={llm.name} model={llm.model} max-calls={args.max_calls}"
        + (" DRY RUN" if args.dry_run else ""),
        file=out,
    )

    async def _run() -> BankReport:
        try:
            return await build_bank(
                games,
                args.count,
                provider=llm,
                repo=repo,
                max_calls=args.max_calls,
                dry_run=args.dry_run,
            )
        finally:
            if provider is None:
                await llm.aclose()

    # Structured logs → stderr so stdout carries only the report.
    with contextlib.redirect_stdout(err):
        configure_logging(cfg.log_level, cfg.log_file)
        report = asyncio.run(_run())

    for game in report.games:
        print(game.summary(), file=out)
        for reason in game.rejected:
            print(f"  rejected: {reason}", file=out)
        if game.error:
            print(f"  error: {game.error}", file=out)
    print(report.usage_line(), file=out)
    return 0 if report.ok else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
