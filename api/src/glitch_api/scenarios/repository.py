"""Scenario cache on the blob store — ``spec/data.md`` → Server-side data.

Objects (``<ns>`` = ``scenarios``; ``scenarios-demo`` for demo-provider output so demo
case files are never served once the real AI is connected):

- ``<ns>/<gameId>/<variationId>.json`` — immutable
  ``{id, gameId, schemaVersion, model, createdAt, contentHash, data}``, written with a
  conditional create. ``variationId = <gameId>-<contentHash[:12]>`` (content-derived).
- ``<ns>/<gameId>/index.json`` — ``{gameId, schemaVersion, variations: [{id, contentHash,
  createdAt}]}`` (oldest first), updated read-modify-write with a generation precondition.

Every object read back is re-validated (schema + domain); an invalid or missing one is
skipped, never served. No learner data is ever written.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from glitch_api.logging import get_logger
from glitch_api.scenarios.schemas import GAMES, SCHEMA_VERSION, ScenarioInvalid, validate_data
from glitch_api.store.base import AlreadyExists, BlobStore, StoreError, create_json, dumps, get_json, update_json

NAMESPACE = "scenarios"
DEMO_NAMESPACE = "scenarios-demo"
INDEX_FILE = "index.json"
ID_HASH_CHARS = 12


def content_hash(data: dict[str, Any]) -> str:
    return hashlib.sha256(dumps(data)).hexdigest()


def variation_id(game_id: str, digest: str) -> str:
    return f"{game_id}-{digest[:ID_HASH_CHARS]}"


@dataclass(frozen=True)
class StoredVariation:
    id: str
    game_id: str
    schema_version: int
    model: str
    created_at: str
    content_hash: str
    data: dict[str, Any]

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "gameId": self.game_id,
            "schemaVersion": self.schema_version,
            "model": self.model,
            "createdAt": self.created_at,
            "contentHash": self.content_hash,
            "data": self.data,
        }


@dataclass(frozen=True)
class IndexEntry:
    id: str
    content_hash: str
    created_at: str


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class ScenarioRepository:
    def __init__(self, store: BlobStore, namespace: str = NAMESPACE) -> None:
        self.store = store
        self.namespace = namespace

    # ---- keys ------------------------------------------------------------------------
    def index_key(self, game_id: str) -> str:
        return f"{self.namespace}/{game_id}/{INDEX_FILE}"

    def object_key(self, game_id: str, vid: str) -> str:
        return f"{self.namespace}/{game_id}/{vid}.json"

    @staticmethod
    def _require_game(game_id: str) -> None:
        if game_id not in GAMES:
            raise KeyError(f"unknown content game {game_id!r}")

    # ---- reads -----------------------------------------------------------------------
    async def index(self, game_id: str) -> list[IndexEntry]:
        self._require_game(game_id)
        got = await get_json(self.store, self.index_key(game_id))
        if got is None:
            return []
        entries: list[IndexEntry] = []
        for raw in (got[0] or {}).get("variations", []):
            if isinstance(raw, dict) and isinstance(raw.get("id"), str) and isinstance(raw.get("contentHash"), str):
                entries.append(IndexEntry(raw["id"], raw["contentHash"], str(raw.get("createdAt", ""))))
        return entries

    async def count(self, game_id: str) -> int:
        return len(await self.index(game_id))

    async def get(self, game_id: str, vid: str) -> StoredVariation | None:
        self._require_game(game_id)
        try:
            got = await get_json(self.store, self.object_key(game_id, vid))
        except ValueError:  # InvalidKey / undecodable JSON
            got = None
        if got is None:
            return None
        raw = got[0]
        try:
            if not isinstance(raw, dict) or raw.get("id") != vid or raw.get("gameId") != game_id:
                raise ScenarioInvalid(["envelope mismatch"])
            if raw.get("schemaVersion") != SCHEMA_VERSION:
                raise ScenarioInvalid(["schema version mismatch"])
            data = validate_data(game_id, raw.get("data"))
        except ScenarioInvalid as exc:
            # Variation ids are never logged (spec): game id + validator rule names only.
            get_logger().warning("scenario_cache_invalid", game_id=game_id, rules=exc.errors)
            return None
        return StoredVariation(
            id=vid,
            game_id=game_id,
            schema_version=SCHEMA_VERSION,
            model=str(raw.get("model", "")),
            created_at=str(raw.get("createdAt", "")),
            content_hash=str(raw.get("contentHash", "")),
            data=data,
        )

    async def next_unseen(self, game_id: str, seen: frozenset[str] | set[str]) -> StoredVariation | None:
        """The oldest cached, valid variation whose id is not in ``seen``."""
        for entry in await self.index(game_id):
            if entry.id in seen:
                continue
            variation = await self.get(game_id, entry.id)
            if variation is not None:
                return variation
        return None

    async def find_by_hash(self, game_id: str, digest: str) -> str | None:
        for entry in await self.index(game_id):
            if entry.content_hash == digest:
                return entry.id
        return None

    # ---- writes ----------------------------------------------------------------------
    async def add(self, game_id: str, data: dict[str, Any], *, model: str) -> tuple[StoredVariation, bool]:
        """Store a validated variation. Returns (variation, created) — created=False when
        identical content was already cached (dedupe by content hash)."""
        self._require_game(game_id)
        data = validate_data(game_id, data)
        digest = content_hash(data)
        vid = variation_id(game_id, digest)
        variation = StoredVariation(vid, game_id, SCHEMA_VERSION, model, _now_iso(), digest, data)
        created = True
        try:
            await create_json(self.store, self.object_key(game_id, vid), variation.to_json())
        except AlreadyExists:
            created = False
            existing = await self.get(game_id, vid)
            if existing is not None:
                variation = existing

        entry = {"id": vid, "contentHash": digest, "createdAt": variation.created_at}

        def add_entry(current: Any) -> dict[str, Any]:
            doc = current if isinstance(current, dict) else {}
            entries = [e for e in doc.get("variations", []) if isinstance(e, dict)]
            if not any(e.get("id") == vid for e in entries):
                entries.append(entry)
            return {"gameId": game_id, "schemaVersion": SCHEMA_VERSION, "variations": entries}

        index = await get_json(self.store, self.index_key(game_id))
        listed = index is not None and any(
            isinstance(e, dict) and e.get("id") == vid for e in (index[0] or {}).get("variations", [])
        )
        if not listed:
            await update_json(self.store, self.index_key(game_id), add_entry)
            # An object that existed but was not indexed (crash between the two writes) is
            # repaired here and counts as new for the caller.
            created = True
        return variation, created


__all__ = [
    "DEMO_NAMESPACE",
    "NAMESPACE",
    "IndexEntry",
    "ScenarioRepository",
    "StoreError",
    "StoredVariation",
    "content_hash",
    "variation_id",
]
