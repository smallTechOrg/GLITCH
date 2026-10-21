"""Scenario generator prompts: ``prompts/scenarios/system.md`` + ``prompts/scenarios/<gameId>.md``.

The game file is completed with the v3 exemplar (``{{EXEMPLAR}}``), the output JSON
Schema (``{{SCHEMA}}``) and, for Source Detective, the verified real-citation list
(``{{REAL_CITATIONS}}``). The user message carries machine-readable tags the fake
provider reads (``<game>``, ``<case_number>``) and, on the one regeneration, the
validator errors (``<validation_errors>``). No learner text is ever part of a prompt.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Final

from glitch_api.llm.base import ChatMessage
from glitch_api.scenarios.schemas import GAMES
from glitch_api.scenarios.schemas.m4g1 import REAL_CITATIONS

PROMPTS_DIR: Final = Path(__file__).resolve().parents[1] / "prompts" / "scenarios"
_PLACEHOLDER = re.compile(r"\{\{[A-Z_]+\}\}")


def _read(name: str) -> str:
    text = (PROMPTS_DIR / name).read_text(encoding="utf-8").strip()
    if not text:
        raise RuntimeError(f"prompt file scenarios/{name} is empty")
    return text


@lru_cache(maxsize=None)
def system_prompt(game_id: str) -> str:
    spec = GAMES[game_id]
    game = (
        _read(f"{game_id}.md")
        .replace("{{EXEMPLAR}}", json.dumps(spec.v3_llm, ensure_ascii=False, indent=1))
        .replace("{{SCHEMA}}", json.dumps(spec.llm_json_schema, separators=(",", ":")))
        .replace("{{REAL_CITATIONS}}", "\n".join(f"  {c}" for c in REAL_CITATIONS))
    )
    if _PLACEHOLDER.search(game):
        raise RuntimeError(f"prompt file scenarios/{game_id}.md has an unknown placeholder")
    return _read("system.md") + "\n\n" + game


def user_prompt(game_id: str, case_number: int, errors: list[str] | None = None) -> str:
    title = GAMES[game_id].title
    lines = [
        f"<game>{game_id}</game>",
        f"<case_number>{case_number}</case_number>",
        f"Write {title} case file #{case_number}: a brand-new scenario that follows every rule.",
    ]
    if errors:
        lines.append("<validation_errors>")
        lines.extend(f"- {e}" for e in errors)
        lines.append("</validation_errors>")
        lines.append("Your previous answer broke the rules above. Write a corrected case file that fixes every one.")
    lines.append("Return only the JSON object.")
    return "\n".join(lines)


def scenario_messages(game_id: str, case_number: int, errors: list[str] | None = None) -> list[ChatMessage]:
    return [
        ChatMessage(role="system", content=system_prompt(game_id)),
        ChatMessage(role="user", content=user_prompt(game_id, case_number, errors)),
    ]
