"""``POST /v1/explain`` DTOs, the LLM output schema and the output validators (``spec/api.md``)."""

from __future__ import annotations

import re
from typing import Any, Final, Literal

from pydantic import BaseModel, ConfigDict, Field

from glitch_api.moderation import filter as moderation

V3: Final = "v3"
TEXT_MAX_WORDS: Final = 60
TEXT_MAX_CHARS: Final = 420
TIP_MAX_WORDS: Final = 25
TIP_MAX_CHARS: Final = 180
PROMPT_VERSION: Final = 1
SCHEMA_NAME: Final = "explanation"

GameIdLiteral = Literal["m1g1", "m1g2", "m2g1", "m2g2", "m3g1", "m3g2", "m4g1", "m4g2", "m4g3"]


class ExplainRequest(BaseModel):
    """Exactly these four keys, all strings (any other key → ``BAD_REQUEST``)."""

    model_config = ConfigDict(extra="forbid", strict=True, frozen=True, populate_by_name=False)

    game_id: GameIdLiteral = Field(alias="gameId")
    variation_id: str = Field(alias="variationId", pattern=r"^(v3|m[1-4]g[1-3]-[0-9a-f]{12})$")
    item_id: str = Field(alias="itemId", pattern=r"^[A-Za-z0-9._-]{1,40}$")
    answer: str = Field(pattern=r"^[a-z_]{1,24}$")


# Strict JSON schema sent to the provider (response_format json_schema, strict).
LLM_JSON_SCHEMA: Final[dict[str, Any]] = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": f"Why the answer was wrong, at most {TEXT_MAX_WORDS} words."},
        "tip": {"type": "string", "description": f"One tip for next time, at most {TIP_MAX_WORDS} words."},
    },
    "required": ["text", "tip"],
    "additionalProperties": False,
}

_MARKDOWN = re.compile(r"[#*`\[]")
_WS = re.compile(r"\s+")


class ExplainInvalid(ValueError):
    """Output failed the limits / plain-text rules. ``errors`` name rules only (no text)."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


def _clean(value: Any, field: str, max_words: int, max_chars: int, errors: list[str]) -> str:
    if not isinstance(value, str):
        errors.append(f"{field}: not a string")
        return ""
    text = _WS.sub(" ", value).strip()  # newlines (and runs of spaces) collapse to one space
    words = len(text.split())
    if words == 0:
        errors.append(f"{field}: empty")
    elif words > max_words:
        errors.append(f"{field}: more than {max_words} words")
    if len(text) > max_chars:
        errors.append(f"{field}: more than {max_chars} characters")
    if "www." in text.lower() or moderation.strip_links(text) != text:
        errors.append(f"{field}: contains a link")
    if _MARKDOWN.search(text):
        errors.append(f"{field}: contains a markdown marker")
    return text


def validate_output(obj: Any) -> tuple[str, str]:
    """``(text, tip)`` normalised, or ``ExplainInvalid``. Extra keys are rejected."""
    if not isinstance(obj, dict):
        raise ExplainInvalid(["not a JSON object"])
    errors: list[str] = []
    extra = sorted(set(obj) - {"text", "tip"})
    if extra:
        errors.append("unexpected keys")
    text = _clean(obj.get("text"), "text", TEXT_MAX_WORDS, TEXT_MAX_CHARS, errors)
    tip = _clean(obj.get("tip"), "tip", TIP_MAX_WORDS, TIP_MAX_CHARS, errors)
    if errors:
        raise ExplainInvalid(errors)
    return text, tip


def moderation_category(text: str, tip: str) -> str | None:
    """None when both may be shown to a learner, else the blocked category (never the text)."""
    for value in (text, tip):
        verdict = moderation.check(value)
        if not verdict.allowed:
            return verdict.category or "blocked"
    return None


def truncate_words(text: str, max_words: int) -> str:
    words = text.split()
    return " ".join(words[:max_words])
