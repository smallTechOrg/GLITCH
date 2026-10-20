"""m4g2 · Confidence Court — 6 AI answers: 3 TRUST + 3 VERIFY, with at least one
low-confidence TRUST (< 80 %) and at least one high-confidence VERIFY (≥ 90 %).

Served ``data``::

    {"answers": [{"id": "a1", "statement": "...", "confidence": 50..99,
                  "evidence": "...", "trust": bool}] × 6}

v3 mapping: [id, statement, confidence, evidence, trust ? 1 : 0]; the web derives
``short = statement.slice(0, 26)`` and ``answer = trust ? "trust" : "verify"``.
"""

from __future__ import annotations

import math
from typing import Annotated, Any

from pydantic import BeforeValidator, Field

from glitch_api.scenarios.schemas.base import BOOLEAN, INTEGER, STRING, GameSpec, Strict, arr, duplicates, obj

STATEMENT_MIN, STATEMENT_MAX = 8, 80
EVIDENCE_MIN, EVIDENCE_MAX = 3, 60
CONFIDENCE_MIN, CONFIDENCE_MAX = 50, 99
ANSWER_COUNT = 6
TRUST_COUNT = 3
LOW_CONFIDENCE = 80  # a TRUST below this is "low-confidence"
HIGH_CONFIDENCE = 90  # a VERIFY at/above this is "high-confidence"


def _integral_float_to_int(value: Any) -> Any:
    """Models often emit ``97.0`` for an integer field: accept integral floats as ints.

    Non-integral / non-finite floats pass through unchanged, so strict mode still rejects
    them (as it does strings and bools).
    """
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return value


Confidence = Annotated[int, BeforeValidator(_integral_float_to_int), Field(ge=CONFIDENCE_MIN, le=CONFIDENCE_MAX)]


class LLMAnswer(Strict):
    statement: str = Field(min_length=STATEMENT_MIN, max_length=STATEMENT_MAX)
    confidence: Confidence
    evidence: str = Field(min_length=EVIDENCE_MIN, max_length=EVIDENCE_MAX)
    trust: bool


class LLMOutput(Strict):
    answers: list[LLMAnswer] = Field(max_length=20)


class Answer(LLMAnswer):
    id: str = Field(pattern=r"^a[1-6]$")


class Data(Strict):
    answers: list[Answer]


LLM_JSON_SCHEMA = obj(
    {"answers": arr(obj({"statement": STRING, "confidence": INTEGER, "evidence": STRING, "trust": BOOLEAN}))}
)


def to_data(out: LLMOutput) -> dict[str, Any]:
    return {
        "answers": [
            {"id": f"a{i}", "statement": a.statement, "confidence": a.confidence, "evidence": a.evidence, "trust": a.trust}
            for i, a in enumerate(out.answers, 1)
        ]
    }


def domain_errors(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    answers = data["answers"]
    if len(answers) != ANSWER_COUNT:
        errors.append(f"answers must have exactly {ANSWER_COUNT} items (got {len(answers)})")
    trusts = [a for a in answers if a["trust"]]
    verifies = [a for a in answers if not a["trust"]]
    if len(trusts) != TRUST_COUNT or len(verifies) != ANSWER_COUNT - TRUST_COUNT:
        errors.append(
            f"answers must be {TRUST_COUNT} TRUST (trust=true) + {ANSWER_COUNT - TRUST_COUNT} VERIFY "
            f"(got {len(trusts)} + {len(verifies)})"
        )
    if not any(a["confidence"] < LOW_CONFIDENCE for a in trusts):
        errors.append(f"at least one TRUST answer must have confidence below {LOW_CONFIDENCE}")
    if not any(a["confidence"] >= HIGH_CONFIDENCE for a in verifies):
        errors.append(f"at least one VERIFY answer must have confidence {HIGH_CONFIDENCE} or more")
    dups = duplicates(a["statement"] for a in answers)
    if dups:
        errors.append(f"every statement must be different (item {dups[0]} repeats an earlier one)")
    return errors


def texts(data: dict[str, Any]) -> list[str]:
    return [t for a in data["answers"] for t in (a["statement"], a["evidence"])]


V3_LLM: dict[str, Any] = {
    "answers": [
        {"statement": "Water boils at 100°C at sea level.", "confidence": 99, "evidence": "Matches 3 textbooks", "trust": True},
        {"statement": "The Eiffel Tower was built in 1925.", "confidence": 97, "evidence": "Encyclopaedia says 1889", "trust": False},
        {"statement": "Dr. Rao's 2022 study proves this.", "confidence": 95, "evidence": "Study not found in any database", "trust": False},
        {"statement": "Your essay has 412 words.", "confidence": 90, "evidence": "Word counter agrees: 412", "trust": True},
        {"statement": "This medicine is safe with your prescription.", "confidence": 98, "evidence": "No source cited. High stakes", "trust": False},
        {"statement": "The capital of Australia is Canberra.", "confidence": 76, "evidence": "Matches atlas and government site", "trust": True},
    ]
}

SPEC = GameSpec(
    game_id="m4g2",
    title="Confidence Court",
    llm_model=LLMOutput,
    llm_json_schema=LLM_JSON_SCHEMA,
    data_model=Data,
    to_data=to_data,
    domain_errors=domain_errors,
    texts=texts,
    v3_llm=V3_LLM,
)
