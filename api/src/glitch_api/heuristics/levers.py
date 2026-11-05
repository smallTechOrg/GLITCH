"""Lever cue rules — the deterministic check shared with the web offline check.

Source of truth: ``spec/capabilities/freewrite-forge.md`` → "Lever cue rules". Matching
is case-insensitive on the trimmed prompt. Used by ``FakeProvider`` (demo mode); the web
app implements the same rules for its offline check.
"""

from __future__ import annotations

import re
from typing import Final, Literal

LeverId = Literal["task", "context", "role", "format", "limit"]

# Order matters: "first missed lever" for tips follows this order.
LEVER_ORDER: Final[tuple[LeverId, ...]] = ("task", "context", "role", "format", "limit")

TASK_MIN_WORDS: Final = 5

_TASK = re.compile(
    r"\b(explain|write|make|plan|create|list|summari[sz]e|describe|give|draft|suggest|compare|teach|tell me|help me)\b",
    re.IGNORECASE,
)
_CONTEXT = re.compile(
    r"\b(i am|i'm|i have|my|because|since|so that|who|years? old|year-old|grade|class)\b",
    re.IGNORECASE,
)
_ROLE = re.compile(
    r"\b(act as|you are|pretend (to be|you are)|imagine you are|as an? (\w+ )?"
    r"(teacher|tutor|expert|coach|scientist|writer|guide|librarian|historian|friend))\b",
    re.IGNORECASE,
)
_FORMAT = re.compile(
    r"\b(list|bullets?|bullet points|table|steps|numbered|paragraphs?|email|poem|headings?|outline|timetable|chart|q&a)\b",
    re.IGNORECASE,
)
_LIMIT_WORD = re.compile(
    r"\b(under|max|maximum|at most|no more than|less than|fewer than|only|within|short|brief)\b",
    re.IGNORECASE,
)
_LIMIT_NUMBER = re.compile(
    r"\b\d+\s*(words?|sentences?|lines?|points?|bullets?|minutes?|paragraphs?|days?)\b",
    re.IGNORECASE,
)

# Canned tip for the first missed lever (also used by the demo provider).
CANNED_TIPS: Final[dict[LeverId, str]] = {
    "task": "Start with a clear action, like 'Explain…' or 'Write…', so NOVA knows exactly what to make.",
    "context": "Add some context: who is it for, or why do you need it?",
    "role": "Give NOVA a role, like 'Act as a friendly science teacher'.",
    "format": "Name the shape you want: a list, a table, steps or an email.",
    "limit": "Set a limit, like 'under 80 words' or '3 bullet points'.",
}
ALL_FIVE_TIP: Final = "All five levers. That's a prompt NOVA can't misread."


def word_count(text: str) -> int:
    return len(text.split())


def evaluate_levers(prompt: str) -> dict[LeverId, bool]:
    """Apply the five cue rules to ``prompt`` (trimmed first)."""
    text = prompt.strip()
    return {
        "task": bool(_TASK.search(text)) and word_count(text) >= TASK_MIN_WORDS,
        "context": bool(_CONTEXT.search(text)),
        "role": bool(_ROLE.search(text)),
        "format": bool(_FORMAT.search(text)),
        "limit": bool(_LIMIT_WORD.search(text) or _LIMIT_NUMBER.search(text)),
    }


def first_missed(levers: dict[LeverId, bool]) -> LeverId | None:
    for lever in LEVER_ORDER:
        if not levers.get(lever, False):
            return lever
    return None


def canned_tip(levers: dict[LeverId, bool]) -> str:
    missed = first_missed(levers)
    return ALL_FIVE_TIP if missed is None else CANNED_TIPS[missed]
