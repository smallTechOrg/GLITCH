"""Free-write DTOs: request limits, strict model output, response aliases."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from glitch_api.schemas.freewrite import (
    FREEWRITE_SCHEMA,
    EvaluateData,
    EvaluateRequest,
    Levers,
    LLMFreewriteOutput,
)

ALL_TRUE = {"task": True, "context": True, "role": True, "format": True, "limit": True}


def test_request_accepts_600_char_prompt_and_trims() -> None:
    req = EvaluateRequest.model_validate({"goalId": "fw1", "goal": "  g  ", "prompt": "  " + "a" * 600 + "  "})
    assert req.goal == "g"
    assert len(req.prompt) == 600


@pytest.mark.parametrize(
    "body",
    [
        {"goalId": "fw1", "goal": "g", "prompt": "a" * 601},
        {"goalId": "fw1", "goal": "g", "prompt": "   "},
        {"goalId": "fw1", "goal": "g" * 201, "prompt": "p"},
        {"goalId": "fw1", "goal": "g"},
        {"goalId": "fw 1", "goal": "g", "prompt": "p"},
        {"goalId": "fw1", "goal": "g", "prompt": 5},
    ],
)
def test_request_rejects_out_of_contract_bodies(body: dict) -> None:
    with pytest.raises(ValidationError):
        EvaluateRequest.model_validate(body)


def test_output_requires_strict_booleans() -> None:
    with pytest.raises(ValidationError):
        LLMFreewriteOutput.model_validate({"reply": "r", "levers": {**ALL_TRUE, "task": "true"}, "tip": "t"})


@pytest.mark.parametrize(
    "data",
    [
        {"reply": "", "levers": ALL_TRUE, "tip": "t"},
        {"reply": "r" * 1201, "levers": ALL_TRUE, "tip": "t"},
        {"reply": "r", "levers": ALL_TRUE, "tip": "t" * 201},
        {"reply": "r", "levers": {k: v for k, v in ALL_TRUE.items() if k != "limit"}, "tip": "t"},
        {"reply": "r", "levers": {**ALL_TRUE, "bonus": True}, "tip": "t"},
        {"reply": ["r"], "levers": ALL_TRUE, "tip": "t"},
    ],
)
def test_output_rejects_schema_violations(data: dict) -> None:
    with pytest.raises(ValidationError):
        LLMFreewriteOutput.model_validate(data)


def test_levers_hit_count() -> None:
    assert Levers(**{**ALL_TRUE, "role": False}).hit_count() == 4


def test_evaluate_data_dumps_camel_case_levers_hit() -> None:
    data = EvaluateData(reply="r", levers=Levers(**ALL_TRUE), leversHit=5, passed=True, tip="t", provider="fake", model="m")
    dumped = data.model_dump(by_alias=True)
    assert dumped["leversHit"] == 5
    assert set(dumped) == {"reply", "levers", "leversHit", "passed", "tip", "provider", "model"}


def test_json_schema_is_strict_mode_compatible() -> None:
    assert FREEWRITE_SCHEMA["additionalProperties"] is False
    assert set(FREEWRITE_SCHEMA["required"]) == set(FREEWRITE_SCHEMA["properties"])
    levers = FREEWRITE_SCHEMA["properties"]["levers"]
    assert levers["additionalProperties"] is False
    assert set(levers["required"]) == {"task", "context", "role", "format", "limit"}
