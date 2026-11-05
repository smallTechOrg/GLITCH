"""m4g2 · Confidence Court — 6 AI answers: 3 TRUST + 3 VERIFY, with at least one
low-confidence TRUST (< 80 %) and at least one high-confidence VERIFY (≥ 90 %).

Served ``data``::

    {"answers": [{"id": "a1", "statement": "...", "confidence": 50..99,
                  "evidence": "...", "trust": bool}] × 6}

v3 mapping: [id, statement, confidence, evidence, trust ? 1 : 0]; the web derives
``short = statement.slice(0, 26)`` and ``answer = trust ? "trust" : "verify"``.

Verdict/evidence agreement (a cached case file once said "Teacher confirms due date"
with trust=false):

- Generation self-check — each LLM item also carries ``evidenceKind`` from a closed enum
  that maps deterministically to TRUST (``TRUSTING_KINDS``) or VERIFY
  (``VERIFYING_KINDS``); ``trust`` must equal ``evidenceKind in TRUSTING_KINDS``. It is a
  self-check only: ``to_data`` drops it, so the served/stored shape is unchanged.
- Evidence keyword sanity (``consistency_errors``, part of ``domain_errors`` so it also
  runs on every cache read): doubt words ("no source", "unverified", "rumour",
  "anonymous", "someone said", ...) ⇒ VERIFY; an un-negated confirmation ("confirms",
  "official", "published", "verified by") with trust=false is a mismatch.
"""

from __future__ import annotations

import math
import re
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field, model_validator

from glitch_api.scenarios.schemas.base import BOOLEAN, INTEGER, STRING, GameSpec, Strict, arr, duplicates, enum, obj

STATEMENT_MIN, STATEMENT_MAX = 8, 80
EVIDENCE_MIN, EVIDENCE_MAX = 3, 60
CONFIDENCE_MIN, CONFIDENCE_MAX = 50, 99
ANSWER_COUNT = 6
TRUST_COUNT = 3
LOW_CONFIDENCE = 80  # a TRUST below this is "low-confidence"
HIGH_CONFIDENCE = 90  # a VERIFY at/above this is "high-confidence"

# evidenceKind → verdict. TRUST kinds: the human check found the statement confirmed.
TRUSTING_KINDS: tuple[str, ...] = ("official_record", "verified_source", "firsthand_confirmed")
# VERIFY kinds: the evidence is missing, weak, stale, against it, or the stakes are high.
VERIFYING_KINDS: tuple[str, ...] = (
    "unsourced",
    "anecdotal",
    "outdated",
    "contradicted",
    "overconfident_claim",
    "high_stakes_unchecked",
)
EVIDENCE_KINDS: tuple[str, ...] = TRUSTING_KINDS + VERIFYING_KINDS
EvidenceKind = Literal[
    "official_record",
    "verified_source",
    "firsthand_confirmed",
    "unsourced",
    "anecdotal",
    "outdated",
    "contradicted",
    "overconfident_claim",
    "high_stakes_unchecked",
]

# Evidence that admits there is no real check ⇒ the answer must be VERIFY.
_DOUBT = re.compile(
    r"\b(?:no (?:\w+ )?(?:sources?|records?|evidence|proof)|unsourced|unverified|not verified|unconfirmed"
    r"|not confirmed|rumou?rs?|anonymous(?:ly)?|someone said|hearsay)\b",
    re.IGNORECASE,
)
# Evidence that reports a confirmation ⇒ TRUST, unless it is negated / qualified.
_CONFIRM = re.compile(r"\b(?:confirms?|confirmed|confirming|official(?:ly)?|published|verified by)\b", re.IGNORECASE)
_NEGATED = re.compile(
    r"\b(?:no|not|never|none|nobody|nothing|without|cannot|unable|fails?|failed|contradicts?|contradicted"
    r"|disagrees?|denies|denied|outdated|expired|retracted|wrong|false|but|however|only)\b|n't\b",
    re.IGNORECASE,
)


def _integral_float_to_int(value: Any) -> Any:
    """Models often emit ``97.0`` for an integer field: accept integral floats as ints.

    Non-integral / non-finite floats pass through unchanged, so strict mode still rejects
    them (as it does strings and bools).
    """
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return value


Confidence = Annotated[int, BeforeValidator(_integral_float_to_int), Field(ge=CONFIDENCE_MIN, le=CONFIDENCE_MAX)]


class _AnswerFields(Strict):
    statement: str = Field(min_length=STATEMENT_MIN, max_length=STATEMENT_MAX)
    confidence: Confidence
    evidence: str = Field(min_length=EVIDENCE_MIN, max_length=EVIDENCE_MAX)
    trust: bool


class LLMAnswer(_AnswerFields):
    evidenceKind: EvidenceKind  # noqa: N815 — the wire name the model emits

    @model_validator(mode="after")
    def _verdict_matches_kind(self) -> LLMAnswer:
        trusting = self.evidenceKind in TRUSTING_KINDS
        if self.trust and not trusting:
            raise ValueError(
                f"evidenceKind {self.evidenceKind!r} means the evidence does not check out, so trust must be false (VERIFY)"
            )
        if not self.trust and trusting:
            raise ValueError(f"evidenceKind {self.evidenceKind!r} means the evidence checks out, so trust must be true (TRUST)")
        return self


class LLMOutput(Strict):
    answers: list[LLMAnswer] = Field(max_length=20)


class Answer(_AnswerFields):
    """Served item — no ``evidenceKind`` (generation-time self-check only)."""

    id: str = Field(pattern=r"^a[1-6]$")


class Data(Strict):
    answers: list[Answer]


LLM_JSON_SCHEMA = obj(
    {
        "answers": arr(
            obj(
                {
                    "statement": STRING,
                    "confidence": INTEGER,
                    "evidence": STRING,
                    "evidenceKind": enum(*EVIDENCE_KINDS),
                    "trust": BOOLEAN,
                }
            )
        )
    }
)


def to_data(out: LLMOutput) -> dict[str, Any]:
    return {
        "answers": [
            {"id": f"a{i}", "statement": a.statement, "confidence": a.confidence, "evidence": a.evidence, "trust": a.trust}
            for i, a in enumerate(out.answers, 1)
        ]
    }


def consistency_errors(data: dict[str, Any]) -> list[str]:
    """Each answer's verdict must agree with its own evidence (keyword sanity, 1-based
    item positions — never the text)."""
    errors: list[str] = []
    for i, a in enumerate(data["answers"], 1):
        evidence = a["evidence"]
        if _DOUBT.search(evidence):
            if a["trust"]:
                errors.append(
                    f"item {i}: the evidence says the claim is unsourced, unverified or hearsay, "
                    "so trust must be false (VERIFY)"
                )
        elif _CONFIRM.search(evidence) and not _NEGATED.search(evidence) and not a["trust"]:
            errors.append(
                f"item {i}: the evidence confirms the statement, so trust must be true (TRUST) "
                "— or make the evidence say what is wrong"
            )
    return errors


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
    errors.extend(consistency_errors(data))
    return errors


def texts(data: dict[str, Any]) -> list[str]:
    return [t for a in data["answers"] for t in (a["statement"], a["evidence"])]


V3_LLM: dict[str, Any] = {
    "answers": [
        {"statement": "Water boils at 100°C at sea level.", "confidence": 99, "evidence": "Matches 3 textbooks", "evidenceKind": "verified_source", "trust": True},
        {"statement": "The Eiffel Tower was built in 1925.", "confidence": 97, "evidence": "Encyclopaedia says 1889", "evidenceKind": "contradicted", "trust": False},
        {"statement": "Dr. Rao's 2022 study proves this.", "confidence": 95, "evidence": "Study not found in any database", "evidenceKind": "unsourced", "trust": False},
        {"statement": "Your essay has 412 words.", "confidence": 90, "evidence": "Word counter agrees: 412", "evidenceKind": "firsthand_confirmed", "trust": True},
        {"statement": "This medicine is safe with your prescription.", "confidence": 98, "evidence": "No source cited. High stakes", "evidenceKind": "high_stakes_unchecked", "trust": False},
        {"statement": "The capital of Australia is Canberra.", "confidence": 76, "evidence": "Matches atlas and government site", "evidenceKind": "official_record", "trust": True},
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
