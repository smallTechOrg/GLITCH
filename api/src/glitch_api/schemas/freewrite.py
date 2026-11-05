"""Free-write DTOs: request, model output, response data, and the output JSON schema.

Mirrors ``spec/api.md`` → ``POST /v1/freewrite/evaluate`` and ``spec/agent.md``
(``LLMFreewriteOutput``: reply 1–1 200 chars, five booleans, tip 1–200 chars).
"""

from __future__ import annotations

from typing import Any, Final, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator

PROMPT_MAX: Final = 600
GOAL_MAX: Final = 200
GOAL_ID_MAX: Final = 40
REPLY_MAX: Final = 1200
TIP_MAX: Final = 200


class EvaluateRequest(BaseModel):
    """Client request. Strings are trimmed before the length rules apply."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore", str_strip_whitespace=True)

    goal_id: str = Field(alias="goalId", min_length=1, max_length=GOAL_ID_MAX, pattern=r"^[A-Za-z0-9_-]+$")
    goal: str = Field(min_length=1, max_length=GOAL_MAX)
    prompt: str = Field(min_length=1, max_length=PROMPT_MAX)

    @field_validator("goal_id", "goal", "prompt", mode="before")
    @classmethod
    def _must_be_str(cls, value: Any) -> Any:
        # Reject numbers/lists outright instead of coercing them.
        if not isinstance(value, str):
            raise ValueError("must be a string")
        return value


class Levers(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task: StrictBool
    context: StrictBool
    role: StrictBool
    format: StrictBool
    limit: StrictBool

    def hit_count(self) -> int:
        return sum((self.task, self.context, self.role, self.format, self.limit))


class LLMFreewriteOutput(BaseModel):
    """What the model must return. Extra top-level keys are ignored; types are strict."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    reply: str = Field(min_length=1, max_length=REPLY_MAX)
    levers: Levers
    tip: str = Field(min_length=1, max_length=TIP_MAX)

    @field_validator("reply", "tip", mode="before")
    @classmethod
    def _must_be_str(cls, value: Any) -> Any:
        if not isinstance(value, str):
            raise ValueError("must be a string")
        return value


class EvaluateData(BaseModel):
    """Response ``data``; ``leversHit`` and ``passed`` are computed server-side."""

    model_config = ConfigDict(populate_by_name=True)

    reply: str
    levers: Levers
    levers_hit: int = Field(alias="leversHit")
    passed: bool
    tip: str
    provider: Literal["openrouter", "fake"]
    model: str


# Strict JSON schema sent as response_format.json_schema.schema (OpenAI/OpenRouter strict mode
# requires every property listed in "required" and additionalProperties false at every level).
FREEWRITE_SCHEMA_NAME: Final = "freewrite_eval"
FREEWRITE_SCHEMA: Final[dict[str, Any]] = {
    "type": "object",
    "properties": {
        "reply": {"type": "string", "description": "NOVA's answer to the learner's prompt, at most 150 words."},
        "levers": {
            "type": "object",
            "properties": {
                "task": {"type": "boolean"},
                "context": {"type": "boolean"},
                "role": {"type": "boolean"},
                "format": {"type": "boolean"},
                "limit": {"type": "boolean"},
            },
            "required": ["task", "context", "role", "format", "limit"],
            "additionalProperties": False,
        },
        "tip": {"type": "string", "description": "One sentence, at most 25 words, for the learner."},
    },
    "required": ["reply", "levers", "tip"],
    "additionalProperties": False,
}
