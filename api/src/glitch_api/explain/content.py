"""Bundled v3 content JSON (``spec/data.md`` → v3 content JSON), loaded once per process.

Each ``content/v3/<gameId>.json`` is ``{gameId, data, copy, conceptRules}``. ``data`` uses
the variation ``data`` shape for the 5 content games (so one extractor serves v3 and
variations) and a game-specific shape for the other 4. The files are rebuilt from the web
``data.ts`` constants by ``web/tests/contracts/explainContent.test.ts`` (parity).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

CONTENT_DIR: Final = Path(__file__).resolve().parent.parent / "content" / "v3"

GAME_IDS: Final = ("m1g1", "m1g2", "m2g1", "m2g2", "m3g1", "m3g2", "m4g1", "m4g2", "m4g3")
# The games whose case files can be NOVA variations (scenario store) in Phase 3.
VARIATION_GAMES: Final = frozenset({"m1g1", "m1g2", "m3g1", "m4g1", "m4g2"})
GAME_TITLES: Final = {
    "m1g1": "Train the Model",
    "m1g2": "Fact or Fib",
    "m2g1": "Tune the Sorter",
    "m2g2": "Prompt Forge",
    "m3g1": "Proxy Hunt",
    "m3g2": "Fairness Lab",
    "m4g1": "Source Detective",
    "m4g2": "Confidence Court",
    "m4g3": "Design the Companion",
}


@dataclass(frozen=True)
class GameContent:
    game_id: str
    data: dict[str, Any]
    copy: dict[str, Any]
    concept_rules: tuple[tuple[str, str], ...]


def _load(game_id: str, directory: Path) -> GameContent:
    raw = json.loads((directory / f"{game_id}.json").read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("gameId") != game_id:
        raise RuntimeError(f"content/v3/{game_id}.json: gameId mismatch")
    data, copy, rules = raw.get("data"), raw.get("copy"), raw.get("conceptRules")
    if not isinstance(data, dict) or not isinstance(copy, dict) or not isinstance(rules, list) or not rules:
        raise RuntimeError(f"content/v3/{game_id}.json: needs data, copy and conceptRules")
    parsed: list[tuple[str, str]] = []
    for rule in rules:
        if not (isinstance(rule, list) and len(rule) == 2 and all(isinstance(x, str) for x in rule)):
            raise RuntimeError(f"content/v3/{game_id}.json: bad concept rule")
        parsed.append((rule[0], rule[1]))
    return GameContent(game_id, data, copy, tuple(parsed))


@lru_cache(maxsize=1)
def load_all(directory: Path = CONTENT_DIR) -> dict[str, GameContent]:
    """All 9 games' v3 content. Raises ``RuntimeError`` / ``OSError`` on a broken package."""
    return {g: _load(g, directory) for g in GAME_IDS}


def content_for(game_id: str) -> GameContent:
    return load_all()[game_id]


def concept_for(rules: tuple[tuple[str, str], ...], item_id: str) -> str | None:
    """The first rule whose prefix matches wins; ``""`` matches everything."""
    for prefix, concept in rules:
        if item_id.startswith(prefix):
            return concept
    return None
