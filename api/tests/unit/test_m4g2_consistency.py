"""m4g2 Confidence Court: every answer's TRUST/VERIFY verdict must agree with its own evidence.

Two deterministic checks:
- generation time: the model's ``evidenceKind`` self-check (closed enum) maps to TRUST or
  VERIFY; ``trust`` must equal ``evidenceKind in TRUSTING_KINDS``;
- every time (generation AND cache reads): evidence keyword sanity — "no source" /
  "unverified" / "rumour" / "anonymous" / "someone said" ⇒ VERIFY; an un-negated
  "confirms" / "official" / "published" / "verified by" with trust=false is a mismatch.
``evidenceKind`` is a self-check only: it is stripped from the served/stored ``data``.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest

from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.schemas import GAMES, ScenarioInvalid, parse_candidate, validate_data
from glitch_api.scenarios.schemas.m4g2 import EVIDENCE_KINDS, TRUSTING_KINDS, VERIFYING_KINDS, consistency_errors


def v3() -> dict[str, Any]:
    return copy.deepcopy(GAMES["m4g2"].v3_llm)


def errors_of(obj: Any) -> list[str]:
    with pytest.raises(ScenarioInvalid) as info:
        parse_candidate("m4g2", obj)
    return info.value.errors


def homework_case() -> dict[str, Any]:
    """The reported contradiction, in served-data shape: a6 is confirmed yet marked VERIFY."""
    data = parse_candidate("m4g2", v3())
    data["answers"][5] = {
        "id": "a6",
        "statement": "Your homework is due Friday.",
        "confidence": 97,
        "evidence": "Teacher confirms due date",
        "trust": False,
    }
    return data


def test_kinds_partition_into_trust_and_verify() -> None:
    assert set(TRUSTING_KINDS).isdisjoint(VERIFYING_KINDS)
    assert set(EVIDENCE_KINDS) == set(TRUSTING_KINDS) | set(VERIFYING_KINDS)
    schema_item = GAMES["m4g2"].llm_json_schema["properties"]["answers"]["items"]
    assert schema_item["properties"]["evidenceKind"]["enum"] == list(EVIDENCE_KINDS)
    assert "evidenceKind" in schema_item["required"]


def test_v3_and_fake_generations_are_self_consistent() -> None:
    for obj in [v3(), *(fake_scenario("m4g2", n) for n in range(1, 9))]:
        for a in obj["answers"]:
            assert a["trust"] == (a["evidenceKind"] in TRUSTING_KINDS)
        data = parse_candidate("m4g2", obj)
        assert consistency_errors(data) == []


def test_evidence_kind_is_stripped_from_served_data() -> None:
    data = parse_candidate("m4g2", v3())
    assert all("evidenceKind" not in a for a in data["answers"])
    with_kind = copy.deepcopy(data)
    with_kind["answers"][0]["evidenceKind"] = "official_record"
    with pytest.raises(ScenarioInvalid):  # the served shape stays exactly the v1 contract
        validate_data("m4g2", with_kind)


@pytest.mark.parametrize("kind", VERIFYING_KINDS)
def test_trust_with_a_verifying_kind_rejected(kind: str) -> None:
    bad = v3()
    assert bad["answers"][0]["trust"] is True
    bad["answers"][0]["evidenceKind"] = kind
    errs = errors_of(bad)
    assert any(e.startswith("answers.0") and "evidenceKind" in e and "trust must be false" in e for e in errs)


@pytest.mark.parametrize("kind", TRUSTING_KINDS)
def test_verify_with_a_trusting_kind_rejected(kind: str) -> None:
    bad = v3()
    assert bad["answers"][1]["trust"] is False
    bad["answers"][1]["evidenceKind"] = kind
    errs = errors_of(bad)
    assert any(e.startswith("answers.1") and "trust must be true" in e for e in errs)


@pytest.mark.parametrize("kind", [None, "", "trusted", "OFFICIAL_RECORD", 1])
def test_missing_or_unknown_evidence_kind_rejected(kind: Any) -> None:
    bad = v3()
    if kind is None:
        del bad["answers"][2]["evidenceKind"]
    else:
        bad["answers"][2]["evidenceKind"] = kind
    assert any("answers.2.evidenceKind" in e for e in errors_of(bad))


def test_reported_homework_contradiction_rejected_on_read() -> None:
    errs = consistency_errors(homework_case())
    assert errs == ["item 6: the evidence confirms the statement, so trust must be true (TRUST) — or make the evidence say what is wrong"]
    with pytest.raises(ScenarioInvalid) as info:
        validate_data("m4g2", homework_case())
    assert any("item 6" in e for e in info.value.errors)
    assert not any("homework" in e.lower() or "teacher" in e.lower() for e in info.value.errors)  # no content


def test_reported_contradiction_rejected_at_generation_even_with_a_matching_kind() -> None:
    bad = v3()
    bad["answers"][1].update(evidence="Teacher confirms due date", evidenceKind="contradicted")  # trust False
    assert any("item 2" in e and "trust must be true" in e for e in errors_of(bad))


@pytest.mark.parametrize(
    "evidence",
    ["No source cited", "Unverified forum post", "Just a rumour", "Rumor on social media", "Anonymous blog post", "Someone said so online", "No official source", "Not confirmed anywhere"],
)
def test_doubtful_evidence_must_be_verify(evidence: str) -> None:
    bad = v3()
    assert bad["answers"][0]["trust"] is True
    bad["answers"][0]["evidence"] = evidence  # kind still a trusting one: keyword check must catch it
    assert any("item 1" in e and "trust must be false" in e for e in errors_of(bad))


@pytest.mark.parametrize(
    "evidence",
    ["Teacher confirms due date", "Official records agree", "Published in Nature 2019", "Verified by the school office", "Confirmed by two textbooks"],
)
def test_confirming_evidence_with_verify_is_a_mismatch(evidence: str) -> None:
    bad = v3()
    bad["answers"][1]["evidence"] = evidence  # trust False, kind "contradicted"
    assert any("item 2" in e and "trust must be true" in e for e in errors_of(bad))


@pytest.mark.parametrize(
    "evidence",
    ["Official site says 1889, not 1925", "No official record of it", "Unofficial fan wiki only", "Published 1990 but outdated", "Nobody confirms this", "Study never published"],
)
def test_negated_or_contradicted_confirmation_may_be_verify(evidence: str) -> None:
    ok = v3()
    ok["answers"][1]["evidence"] = evidence  # trust False
    data = parse_candidate("m4g2", ok)
    assert data["answers"][1]["trust"] is False


@pytest.mark.parametrize("evidence", ["Official records confirm it", "Published atlas agrees", "Verified by the register"])
def test_confirming_evidence_with_trust_passes(evidence: str) -> None:
    ok = v3()
    ok["answers"][0]["evidence"] = evidence
    assert parse_candidate("m4g2", ok)["answers"][0]["evidence"] == evidence


def test_prompt_explains_the_self_check() -> None:
    from glitch_api.scenarios.prompts import system_prompt

    text = system_prompt("m4g2")
    assert '"evidenceKind"' in text
    assert all(k in text for k in EVIDENCE_KINDS)
