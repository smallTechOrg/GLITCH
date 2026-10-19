"""Deterministic output filter (fail-closed). Zero tokens, zero extra calls.

``check(text)`` blocks on a word-list hit (``blocklist.txt``) or a block pattern;
``strip_links(text)`` replaces URLs with "[link removed]". Applied to NOVA's reply and tip
— never to learner input (the brief scopes moderation to output).

blocklist.txt format: one term per line, ``#`` comments, a trailing ``*`` means "prefix"
(``fuck*`` blocks "fucking"), multi-word phrases allowed. Terms match on letter boundaries
so "Scunthorpe" and "hello" are safe. Text is checked raw and with common leetspeak
substitutions folded (``sh1t`` → ``shit``).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Final

BLOCKLIST_FILE: Final = Path(__file__).with_name("blocklist.txt")
LINK_REPLACEMENT: Final = "[link removed]"

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})

_URL = re.compile(
    r"(?i)\b(?:https?://|ftp://|www\.)[^\s<>()\[\]]+"
    r"|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|co|info|biz|xyz|ly|gg|me|app|dev|tv|ru|cn|uk)"
    r"(?:/[^\s<>()\[\]]*)?\b"
)

# Output-shape patterns that must never reach a learner (prompt/infrastructure leaks).
_BLOCK_PATTERNS: Final[tuple[tuple[str, re.Pattern[str]], ...]] = (
    ("prompt_leak", re.compile(r"</?\s*learner_prompt\s*>", re.IGNORECASE)),
    ("secret_leak", re.compile(r"\bsk-or-[A-Za-z0-9-]{8,}")),
)


@dataclass(frozen=True)
class ModerationVerdict:
    allowed: bool
    category: str | None = None  # "blocklist" | "prompt_leak" | "secret_leak" — never the matched text


@lru_cache(maxsize=1)
def _blocklist_regex() -> re.Pattern[str] | None:
    terms: list[str] = []
    for raw in BLOCKLIST_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip().lower()
        if not line:
            continue
        prefix = line.endswith("*")
        word = re.escape(line.rstrip("*").strip()).replace(r"\ ", r"\s+")
        terms.append(word + (r"[a-z]*" if prefix else ""))
    if not terms:
        return None
    return re.compile(r"(?<![a-z])(?:" + "|".join(terms) + r")(?![a-z])", re.IGNORECASE)


def check(text: str) -> ModerationVerdict:
    """Return whether ``text`` may be shown to a learner."""
    for category, pattern in _BLOCK_PATTERNS:
        if pattern.search(text):
            return ModerationVerdict(False, category)
    regex = _blocklist_regex()
    if regex is not None:
        lowered = text.lower()
        if regex.search(lowered) or regex.search(lowered.translate(_LEET)):
            return ModerationVerdict(False, "blocklist")
    return ModerationVerdict(True)


def strip_links(text: str) -> str:
    """Replace every URL / bare web domain with "[link removed]"."""
    return _URL.sub(LINK_REPLACEMENT, text)
