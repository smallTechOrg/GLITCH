"""Prompt files, loaded once. Learner text is inserted inside delimiter tags.

Any delimiter-looking tag inside learner text (``<learner_prompt>``, ``</goal>`` …) is
neutralised first so a learner cannot close the data block and speak as the system.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Final

from glitch_api.llm.base import ChatMessage

PROMPTS_DIR: Final = Path(__file__).resolve().parent
TAG_REPLACEMENT: Final = "[tag removed]"

_DELIMITER_TAG = re.compile(r"<\s*/?\s*(learner_prompt|goal)\b[^>]*>", re.IGNORECASE)


def neutralise(text: str) -> str:
    return _DELIMITER_TAG.sub(TAG_REPLACEMENT, text)


class PromptLibrary:
    def __init__(self, directory: Path = PROMPTS_DIR) -> None:
        self.directory = directory
        self.freewrite_system = self._read("freewrite_system.md")
        self.freewrite_user = self._read("freewrite_user.md")

    def _read(self, name: str) -> str:
        text = (self.directory / name).read_text(encoding="utf-8").strip()
        if not text:
            raise RuntimeError(f"prompt file {name} is empty")
        return text

    def freewrite_messages(self, goal: str, prompt: str) -> list[ChatMessage]:
        user = self.freewrite_user.format(goal=neutralise(goal), prompt=neutralise(prompt))
        return [
            ChatMessage(role="system", content=self.freewrite_system),
            ChatMessage(role="user", content=user),
        ]


@lru_cache(maxsize=1)
def get_prompt_library() -> PromptLibrary:
    return PromptLibrary()


def reset_prompt_library() -> None:
    get_prompt_library.cache_clear()
