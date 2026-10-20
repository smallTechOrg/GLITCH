"""m1g2 · Fact or Fib — exactly 6 sentences, exactly 3 fibs, each fib explained in ≤ 20 words.

Served ``data``::

    {"sentences": [{"text": "...", "fib": bool, "explanation": "..." | null}] × 6}

v3 mapping: Sentence = [text, fib ? 1 : 0, explanation (fibs only)]. ``explanation`` is a
string on fibs and ``null`` on true sentences.
"""

from __future__ import annotations

from typing import Any

from pydantic import Field

from glitch_api.scenarios.schemas.base import BOOLEAN, STRING, GameSpec, Strict, arr, duplicates, obj, word_count

TEXT_MIN, TEXT_MAX = 10, 110
EXPLANATION_MAX_CHARS = 140
EXPLANATION_MAX_WORDS = 20
SENTENCE_COUNT = 6
FIB_COUNT = 3


class LLMSentence(Strict):
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    fib: bool
    explanation: str = Field(max_length=EXPLANATION_MAX_CHARS)  # "" for true sentences


class LLMOutput(Strict):
    sentences: list[LLMSentence] = Field(max_length=20)


class Sentence(Strict):
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    fib: bool
    explanation: str | None = Field(max_length=EXPLANATION_MAX_CHARS)


class Data(Strict):
    sentences: list[Sentence]


LLM_JSON_SCHEMA = obj({"sentences": arr(obj({"text": STRING, "fib": BOOLEAN, "explanation": STRING}))})


def to_data(out: LLMOutput) -> dict[str, Any]:
    return {
        "sentences": [
            {"text": s.text, "fib": s.fib, "explanation": (s.explanation or None) if s.fib else None}
            for s in out.sentences
        ]
    }


def domain_errors(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    sentences = data["sentences"]
    if len(sentences) != SENTENCE_COUNT:
        errors.append(f"sentences must have exactly {SENTENCE_COUNT} items (got {len(sentences)})")
    fibs = [s for s in sentences if s["fib"]]
    if len(fibs) != FIB_COUNT:
        errors.append(f"exactly {FIB_COUNT} sentences must be fibs (got {len(fibs)})")
    for i, s in enumerate(sentences, 1):
        if s["fib"]:
            explanation = s["explanation"] or ""
            if not explanation.strip():
                errors.append(f"sentence {i} is a fib but has no explanation")
            elif word_count(explanation) > EXPLANATION_MAX_WORDS:
                errors.append(
                    f"sentence {i}: explanation must be at most {EXPLANATION_MAX_WORDS} words "
                    f"(got {word_count(explanation)})"
                )
        elif s["explanation"] is not None:
            errors.append(f"sentence {i} is true and must have no explanation")
    dups = duplicates(s["text"] for s in sentences)
    if dups:
        errors.append(f"every sentence must be different (repeated: {dups[0]!r})")
    return errors


def texts(data: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for s in data["sentences"]:
        out.append(s["text"])
        if s["explanation"]:
            out.append(s["explanation"])
    return out


V3_LLM: dict[str, Any] = {
    "sentences": [
        {"text": "Machine learning finds patterns in training data.", "fib": False, "explanation": ""},
        {
            "text": "A model that memorizes its training data will always do well on new data.",
            "fib": True,
            "explanation": "Memorizing is not generalizing. New data is the real test.",
        },
        {"text": "Labels are the right answers attached to training examples.", "fib": False, "explanation": ""},
        {
            "text": "A model's prediction is always a proven fact.",
            "fib": True,
            "explanation": "A prediction is an informed guess and it can be wrong.",
        },
        {"text": "Traditional software follows rules that a person wrote.", "fib": False, "explanation": ""},
        {
            "text": "Testing data is the same data the model trained on.",
            "fib": True,
            "explanation": "Testing uses data the model has NOT seen.",
        },
    ]
}

SPEC = GameSpec(
    game_id="m1g2",
    title="Fact or Fib",
    llm_model=LLMOutput,
    llm_json_schema=LLM_JSON_SCHEMA,
    data_model=Data,
    to_data=to_data,
    domain_errors=domain_errors,
    texts=texts,
    v3_llm=V3_LLM,
)
