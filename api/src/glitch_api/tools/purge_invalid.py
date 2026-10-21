"""Re-validate the scenario cache; quarantine variations today's validators reject.

    cd api && uv run python -m glitch_api.tools.purge_invalid               # dry run (default)
    cd api && uv run python -m glitch_api.tools.purge_invalid --apply       # quarantine failures
    cd api && uv run python -m glitch_api.tools.purge_invalid --backend gcs --apply

Scans every content game in both namespaces (``scenarios`` and ``scenarios-demo``) of the
configured blob store (``GLITCH_BLOB_BACKEND`` / ``GLITCH_CACHE_DIR`` / ``GLITCH_GCS_BUCKET``,
overridable with ``--backend`` / ``--cache-dir`` / ``--bucket``). Each variation object —
indexed or not — goes through the same checks as a cache read (envelope, schema version,
schema + domain validation); an index entry whose object is gone is a failure too.

Dry run (default): one ``INVALID <ns>/<game>/<id>: <rules>`` line per failure, then
``N checked, K invalid``. Nothing is written. Output carries ids and validator rule
messages only — never generated text (validator messages use item positions).

``--apply``: each failing object is copied to ``quarantine/<ns>/<game>/<id>.json``
(kept for inspection, outside every served prefix), removed from ``<ns>/<game>/index.json``
(generation-checked read-modify-write) and deleted from the served prefix, so it is never
served. Idempotent: a second run finds nothing.

Exit 0 = scan (and apply) completed; 1 = blob store failure; 2 = bad usage/config.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any

from glitch_api.config import ConfigError, Settings
from glitch_api.scenarios.repository import DEMO_NAMESPACE, INDEX_FILE, NAMESPACE
from glitch_api.scenarios.schemas import GAME_IDS, SCHEMA_VERSION, ScenarioInvalid, validate_data
from glitch_api.store import BlobStore, StoreError, build_store, get_json, update_json

QUARANTINE_PREFIX = "quarantine"
NAMESPACES: tuple[str, ...] = (NAMESPACE, DEMO_NAMESPACE)


@dataclass(frozen=True)
class Failure:
    namespace: str
    game_id: str
    variation_id: str
    rules: tuple[str, ...]

    @property
    def path(self) -> str:
        return f"{self.namespace}/{self.game_id}/{self.variation_id}"

    @property
    def key(self) -> str:
        return f"{self.path}.json"

    @property
    def quarantine_key(self) -> str:
        return f"{QUARANTINE_PREFIX}/{self.key}"


def check_envelope(game_id: str, vid: str, raw: Any) -> list[str]:
    """The cache-read checks (``ScenarioRepository.get``) as rule messages; [] = valid."""
    if not isinstance(raw, dict) or raw.get("id") != vid or raw.get("gameId") != game_id:
        return ["envelope mismatch"]
    if raw.get("schemaVersion") != SCHEMA_VERSION:
        return ["schema version mismatch"]
    try:
        validate_data(game_id, raw.get("data"))
    except ScenarioInvalid as exc:
        return list(exc.errors)
    return []


async def _indexed_ids(store: BlobStore, namespace: str, game_id: str) -> list[str]:
    got = await get_json(store, f"{namespace}/{game_id}/{INDEX_FILE}")
    if got is None or not isinstance(got[0], dict):
        return []
    return [e["id"] for e in got[0].get("variations", []) if isinstance(e, dict) and isinstance(e.get("id"), str)]


async def scan(store: BlobStore) -> tuple[int, list[Failure]]:
    """(variations checked, failures) across every game and namespace. Read-only."""
    checked = 0
    failures: list[Failure] = []
    for namespace in NAMESPACES:
        for game_id in GAME_IDS:
            prefix = f"{namespace}/{game_id}/"
            object_ids = [
                k[len(prefix) : -len(".json")]
                for k in await store.list(prefix)
                if k.endswith(".json") and k != prefix + INDEX_FILE and "/" not in k[len(prefix) :]
            ]
            indexed = await _indexed_ids(store, namespace, game_id)
            for vid in object_ids:
                checked += 1
                try:
                    got = await get_json(store, f"{prefix}{vid}.json")
                except ValueError:  # undecodable JSON
                    rules = ["undecodable JSON"]
                else:
                    rules = ["object missing"] if got is None else check_envelope(game_id, vid, got[0])
                if rules:
                    failures.append(Failure(namespace, game_id, vid, tuple(rules)))
            for vid in dict.fromkeys(indexed):
                if vid not in object_ids:
                    checked += 1
                    failures.append(Failure(namespace, game_id, vid, ("object missing",)))
    return checked, failures


async def quarantine(store: BlobStore, failure: Failure) -> None:
    """Copy to ``quarantine/``, drop from the index, then delete from the served prefix."""
    try:
        blob = await store.get(failure.key)
    except ValueError:  # an id that is not a valid key segment cannot be stored anyway
        blob = None
    if blob is not None:
        await store.put(failure.quarantine_key, blob.data)
    index_key = f"{failure.namespace}/{failure.game_id}/{INDEX_FILE}"
    if await store.get(index_key) is not None:

        def drop(current: Any) -> Any:
            doc = current if isinstance(current, dict) else {}
            entries = [e for e in doc.get("variations", []) if not (isinstance(e, dict) and e.get("id") == failure.variation_id)]
            return {**doc, "variations": entries}

        await update_json(store, index_key, drop)
    if blob is not None:
        await store.delete(failure.key)


async def run(store: BlobStore, *, apply: bool, out: IO[str]) -> int:
    checked, failures = await scan(store)
    for f in failures:
        print(f"INVALID {f.path}: {'; '.join(f.rules)}", file=out)
    if not apply:
        print(f"{checked} checked, {len(failures)} invalid (dry run — nothing moved; re-run with --apply to quarantine)", file=out)
        return 0
    for f in failures:
        await quarantine(store, f)
        print(f"QUARANTINED {f.path} -> {f.quarantine_key}", file=out)
    print(f"{checked} checked, {len(failures)} invalid, {len(failures)} quarantined", file=out)
    return 0


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="python -m glitch_api.tools.purge_invalid",
        description="Re-validate cached scenario variations; quarantine the ones that fail.",
    )
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="list failures only (default)")
    mode.add_argument("--apply", action="store_true", help="move failures to quarantine/ and un-index them")
    p.add_argument("--backend", choices=["local", "gcs"], default=None, help="blob backend (default: GLITCH_BLOB_BACKEND)")
    p.add_argument("--cache-dir", default=None, help="local cache dir (default: GLITCH_CACHE_DIR)")
    p.add_argument("--bucket", default=None, help="GCS bucket (default: GLITCH_GCS_BUCKET)")
    return p.parse_args(list(argv) if argv is not None else None)


def _location(settings: Settings) -> str:
    if settings.blob_backend == "gcs":
        return f"gs://{settings.gcs_bucket}/{settings.blob_prefix}".rstrip("/")
    return str(settings.cache_path)


def main(
    argv: Sequence[str] | None = None,
    *,
    settings: Settings | None = None,
    gcs_client: Any | None = None,
    out: IO[str] | None = None,
) -> int:
    args = parse_args(argv)
    out = out or sys.stdout
    try:
        cfg = settings or Settings()
        update: dict[str, Any] = {}
        if args.backend:
            update["blob_backend"] = args.backend
        if args.cache_dir:
            update["cache_dir"] = str(Path(args.cache_dir).expanduser().resolve())
        if args.bucket:
            update["gcs_bucket"] = args.bucket
        cfg = cfg.model_copy(update=update)
        if cfg.blob_backend == "gcs" and not cfg.gcs_bucket:
            raise ConfigError("--backend gcs needs a bucket: set GLITCH_GCS_BUCKET in .env or pass --bucket")
        store = build_store(cfg, gcs_client=gcs_client)
    except (ConfigError, ValueError) as exc:
        print(f"CONFIG_ERROR: {exc}", file=sys.stderr)
        return 2
    print(f"purge_invalid: {cfg.blob_backend} {_location(cfg)} — {'apply' if args.apply else 'dry run'}", file=out)
    try:
        return asyncio.run(run(store, apply=args.apply, out=out))
    except StoreError as exc:
        print(f"STORE_ERROR: {exc}", file=sys.stderr)
        return 1


__all__ = ["Failure", "check_envelope", "main", "quarantine", "run", "scan"]

if __name__ == "__main__":
    sys.exit(main())
