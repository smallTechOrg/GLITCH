"""Shared machinery for per-game scenario schemas.

Each content game defines a ``GameSpec``:
- ``llm_model`` — pydantic model of what the LLM must return (types + length bounds; the
  schema-validation step). Its strict JSON Schema (``llm_json_schema``) is sent as
  ``response_format`` — only keywords every structured-output provider accepts (types,
  enums, required, additionalProperties false); counts are enforced by the domain step.
- ``to_data(llm_out)`` — normalise into the stored/served ``data`` shape (assign item ids,
  derive answer-key fields). This is THE shape the web game consumes (``spec/api.md``).
- ``data_model`` — pydantic model of ``data`` (re-validates cached objects on read).
- ``domain_errors(data)`` — v3 counts/balance/answer-key rules; [] when valid.
- ``texts(data)`` — every learner-visible string (moderation input).
- ``v3_llm`` — the v3 original in LLM-output shape (prompt exemplar; must validate).
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict

SCHEMA_VERSION = 1


class Strict(BaseModel):
    """Base for scenario models: unknown keys rejected, strings trimmed, no type coercion."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, strict=True, populate_by_name=True)


def word_count(text: str) -> int:
    return len(text.split())


def duplicates(values: Iterable[str]) -> list[int]:
    """1-based positions of items repeating an earlier one (case/space-insensitive).

    Positions, never the text: validator errors are logged and must carry no content.
    """
    seen: set[str] = set()
    dups: list[int] = []
    for i, value in enumerate(values, 1):
        norm = re.sub(r"\s+", " ", value.strip().lower())
        if norm in seen:
            dups.append(i)
        seen.add(norm)
    return dups


def obj(properties: dict[str, Any]) -> dict[str, Any]:
    """Strict JSON-Schema object: every property required, nothing extra."""
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def arr(items: dict[str, Any]) -> dict[str, Any]:
    return {"type": "array", "items": items}


STRING: dict[str, Any] = {"type": "string"}
BOOLEAN: dict[str, Any] = {"type": "boolean"}
INTEGER: dict[str, Any] = {"type": "integer"}


def enum(*values: str) -> dict[str, Any]:
    return {"type": "string", "enum": list(values)}


@dataclass(frozen=True)
class GameSpec:
    game_id: str
    title: str
    llm_model: type[BaseModel]
    llm_json_schema: dict[str, Any]
    data_model: type[BaseModel]
    to_data: Callable[[Any], dict[str, Any]]
    domain_errors: Callable[[dict[str, Any]], list[str]]
    texts: Callable[[dict[str, Any]], list[str]]
    v3_llm: dict[str, Any]

    @property
    def schema_name(self) -> str:
        return f"scenario_{self.game_id}"
