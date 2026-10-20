"""Per-game scenario schemas + domain validators, the fake generator and the prompts.

Validators are proven against the v3 originals (must pass) and hand-broken generations
(must fail with a reason the regeneration can act on).
"""

from __future__ import annotations

import copy
import json
import re
from typing import Any

import pytest

from glitch_api.scenarios.fake_gen import fake_scenario, fake_scenario_from_prompt
from glitch_api.scenarios.prompts import scenario_messages, system_prompt, user_prompt
from glitch_api.scenarios.repository import content_hash
from glitch_api.scenarios.schemas import GAME_IDS, GAMES, ScenarioInvalid, parse_candidate, validate_data
from glitch_api.scenarios.schemas.m4g1 import REAL_CITATIONS


def v3(game_id: str) -> dict[str, Any]:
    return copy.deepcopy(GAMES[game_id].v3_llm)


def errors_of(game_id: str, obj: Any) -> list[str]:
    with pytest.raises(ScenarioInvalid) as info:
        parse_candidate(game_id, obj)
    return info.value.errors


# ---- every game: v3 original passes, served shape is exact ------------------------------
@pytest.mark.parametrize("game_id", GAME_IDS)
def test_v3_original_passes_every_validator(game_id: str) -> None:
    data = parse_candidate(game_id, v3(game_id))
    assert validate_data(game_id, data) == data  # served data re-validates (cache reads)


def test_game_ids_are_the_five_content_games() -> None:
    assert GAME_IDS == ("m1g1", "m1g2", "m3g1", "m4g1", "m4g2")


@pytest.mark.parametrize("game_id", GAME_IDS)
def test_llm_json_schema_is_strict_everywhere(game_id: str) -> None:
    def walk(node: dict[str, Any]) -> None:
        if node.get("type") == "object":
            assert node["additionalProperties"] is False
            assert sorted(node["required"]) == sorted(node["properties"])
            for child in node["properties"].values():
                walk(child)
        elif node.get("type") == "array":
            walk(node["items"])

    walk(GAMES[game_id].llm_json_schema)


@pytest.mark.parametrize("game_id", GAME_IDS)
def test_non_object_and_extra_keys_rejected(game_id: str) -> None:
    assert errors_of(game_id, ["not", "an", "object"]) == ["output must be a JSON object"]
    bad = v3(game_id)
    bad["extra"] = 1
    assert any("extra" in e for e in errors_of(game_id, bad))


@pytest.mark.parametrize("game_id", GAME_IDS)
def test_wrong_types_rejected_not_coerced(game_id: str) -> None:
    bad = v3(game_id)
    key = next(iter(bad.keys() - {"candidate"}))
    bad[key][0] = {k: (1 if isinstance(v, str) else v) for k, v in bad[key][0].items()}
    assert errors_of(game_id, bad)


@pytest.mark.parametrize("game_id", GAME_IDS)
def test_missing_items_rejected(game_id: str) -> None:
    bad = v3(game_id)
    key = next(iter(bad.keys() - {"candidate"}))
    bad[key] = bad[key][:-1]
    assert errors_of(game_id, bad)


# (path to the item list, index of an item, index of another item with the same answer, text key)
_SAME_ANSWER_PAIRS = {
    "m1g1": ("trainEmails", 0, 2, "text"),  # both spam
    "m1g2": ("sentences", 0, 2, "text"),  # both true
    "m3g1": ("lines", 0, 1, "text"),  # both proxies
    "m4g1": ("citations", 1, 3, "text"),  # both invented
    "m4g2": ("answers", 1, 2, "statement"),  # both VERIFY
}


@pytest.mark.parametrize("game_id", GAME_IDS)
def test_duplicate_items_rejected(game_id: str) -> None:
    key, a, b, text_key = _SAME_ANSWER_PAIRS[game_id]
    bad = v3(game_id)
    bad[key][b][text_key] = "  " + bad[key][a][text_key].upper() + " "  # case/space-insensitive
    errs = errors_of(game_id, bad)
    assert any("different" in e and f"item {b + 1}" in e for e in errs)
    assert not any(bad[key][a][text_key].lower() in e.lower() for e in errs)  # errors carry no content


# ---- m1g1 Train the Model ---------------------------------------------------------------
def test_m1g1_served_shape_and_derived_model_right() -> None:
    data = parse_candidate("m1g1", v3("m1g1"))
    assert [e["id"] for e in data["trainEmails"]] == ["e1", "e2", "e3", "e4", "e5", "e6"]
    assert [e["id"] for e in data["testEmails"]] == ["t1", "t2", "t3", "t4"]
    assert [e["modelRight"] for e in data["testEmails"]] == [False, True, True, False]  # v3 "w","r","r","w"
    assert set(data["testEmails"][0]) == {"id", "text", "label", "modelSays", "modelRight"}


def test_m1g1_model_wrong_on_three_rejected() -> None:
    bad = v3("m1g1")
    bad["testEmails"][1]["modelSays"] = "NOT SPAM"  # spam called not spam → 3 wrong
    assert any("WRONG on exactly 2" in e for e in errors_of("m1g1", bad))


def test_m1g1_unbalanced_training_rejected() -> None:
    bad = v3("m1g1")
    bad["trainEmails"][1]["label"] = "spam"
    assert any("3 spam" in e for e in errors_of("m1g1", bad))


def test_m1g1_model_right_cannot_be_injected() -> None:
    bad = v3("m1g1")
    bad["testEmails"][0]["modelRight"] = True
    assert errors_of("m1g1", bad)  # extra key: the model never decides the answer key


def test_m1g1_overlong_email_rejected() -> None:
    bad = v3("m1g1")
    bad["trainEmails"][0]["text"] = "x" * 61
    assert any("trainEmails.0.text" in e for e in errors_of("m1g1", bad))


# ---- m1g2 Fact or Fib -------------------------------------------------------------------
def test_m1g2_served_shape() -> None:
    data = parse_candidate("m1g2", v3("m1g2"))
    assert [s["fib"] for s in data["sentences"]] == [False, True, False, True, False, True]
    assert data["sentences"][0]["explanation"] is None
    assert data["sentences"][1]["explanation"] == "Memorizing is not generalizing. New data is the real test."


@pytest.mark.parametrize("fibs", [2, 4])
def test_m1g2_wrong_fib_count_rejected(fibs: int) -> None:
    bad = v3("m1g2")
    if fibs == 2:
        bad["sentences"][1].update(fib=False, explanation="")
    else:
        bad["sentences"][0].update(fib=True, explanation="This one is wrong.")
    assert any("exactly 3 sentences must be fibs" in e for e in errors_of("m1g2", bad))


def test_m1g2_seven_sentences_rejected() -> None:
    bad = v3("m1g2")
    bad["sentences"].append({"text": "Models can be retrained with new data.", "fib": False, "explanation": ""})
    assert any("exactly 6" in e for e in errors_of("m1g2", bad))


def test_m1g2_fib_without_explanation_rejected() -> None:
    bad = v3("m1g2")
    bad["sentences"][1]["explanation"] = ""
    assert any("no explanation" in e for e in errors_of("m1g2", bad))


def test_m1g2_explanation_over_20_words_rejected() -> None:
    bad = v3("m1g2")
    bad["sentences"][1]["explanation"] = " ".join(["word"] * 21)
    assert any("at most 20 words" in e for e in errors_of("m1g2", bad))


def test_m1g2_true_sentence_explanation_dropped() -> None:
    obj = v3("m1g2")
    obj["sentences"][0]["explanation"] = "Not needed."
    assert parse_candidate("m1g2", obj)["sentences"][0]["explanation"] is None


def test_m1g2_stored_true_sentence_with_explanation_rejected() -> None:
    data = parse_candidate("m1g2", v3("m1g2"))
    data["sentences"][0]["explanation"] = "tampered"
    with pytest.raises(ScenarioInvalid):
        validate_data("m1g2", data)


# ---- m3g1 Proxy Hunt --------------------------------------------------------------------
def test_m3g1_served_shape_has_redacted_lines_first() -> None:
    data = parse_candidate("m3g1", v3("m3g1"))
    assert data["candidate"] == "ANAYA"
    assert data["lines"][:2] == [
        {"text": "NAME", "proxy": None, "note": "hid"},
        {"text": "GENDER", "proxy": None, "note": "hid"},
    ]
    assert len(data["lines"]) == 11
    assert sum(ln["proxy"] is True for ln in data["lines"]) == 5
    assert sum(ln["proxy"] is False for ln in data["lines"]) == 4


def test_m3g1_candidate_upper_cased() -> None:
    obj = v3("m3g1")
    obj["candidate"] = "maya"
    assert parse_candidate("m3g1", obj)["candidate"] == "MAYA"


def test_m3g1_four_proxies_rejected() -> None:
    bad = v3("m3g1")
    bad["lines"][0]["proxy"] = False
    errs = errors_of("m3g1", bad)
    assert any("exactly 5 lines must be proxies" in e for e in errs)
    assert any("exactly 4 lines must be real" in e for e in errs)


def test_m3g1_repeating_name_line_rejected() -> None:
    bad = v3("m3g1")
    bad["lines"][5]["text"] = "Gender"
    assert any("NAME and GENDER" in e for e in errors_of("m3g1", bad))


def test_m3g1_bad_candidate_rejected() -> None:
    bad = v3("m3g1")
    bad["candidate"] = "Anaya 99"
    assert any("candidate" in e for e in errors_of("m3g1", bad))


def test_m3g1_long_note_rejected() -> None:
    bad = v3("m3g1")
    bad["lines"][0]["note"] = "This is a very long note that keeps on going past twelve words easily."
    assert any("at most 12 words" in e for e in errors_of("m3g1", bad))


# ---- m4g1 Source Detective --------------------------------------------------------------
def test_m4g1_served_shape() -> None:
    data = parse_candidate("m4g1", v3("m4g1"))
    assert [c["id"] for c in data["citations"]] == ["c1", "c2", "c3", "c4", "c5"]
    assert [c["real"] for c in data["citations"]] == [True, False, True, False, True]


def test_m4g1_real_citation_not_in_verified_list_rejected() -> None:
    bad = v3("m4g1")
    bad["citations"][0]["text"] = "Smith (2020). A Totally Real Paper. Nature."
    assert any("not copied exactly" in e for e in errors_of("m4g1", bad))


def test_m4g1_real_citation_snapped_to_canonical_spelling() -> None:
    obj = v3("m4g1")
    obj["citations"][0]["text"] = "unesco (2021).  Recommendation on the Ethics of Artificial Intelligence. Paris"
    assert parse_candidate("m4g1", obj)["citations"][0]["text"] == REAL_CITATIONS[0]


def test_m4g1_invented_citation_that_is_real_rejected() -> None:
    bad = v3("m4g1")
    bad["citations"][1]["text"] = REAL_CITATIONS[5]
    assert any("is a real source" in e for e in errors_of("m4g1", bad))


def test_m4g1_invented_citation_with_real_author_rejected() -> None:
    bad = v3("m4g1")
    bad["citations"][1]["text"] = "Turing (1951). Robots Can Read Minds. Mind, 60(1)."
    assert any("real source's author" in e for e in errors_of("m4g1", bad))


@pytest.mark.parametrize("fakes", [1, 4])
def test_m4g1_fake_count_out_of_range_rejected(fakes: int) -> None:
    bad = v3("m4g1")
    if fakes == 1:
        bad["citations"][1] = {"text": REAL_CITATIONS[6], "real": True}
    else:
        bad["citations"][0] = {"text": "Dr. Who (2020). Time Travel for AI. Gallifrey Journal.", "real": False}
        bad["citations"][2] = {"text": "Q. Nobody (2021). Nothing Is Real. Void Press.", "real": False}
    assert any("2 or 3 citations must be invented" in e for e in errors_of("m4g1", bad))


def test_m4g1_bad_citation_format_rejected() -> None:
    bad = v3("m4g1")
    bad["citations"][1]["text"] = "Some random words without a year in them"
    assert any("Author (Year)" in e for e in errors_of("m4g1", bad))


def test_m4g1_verified_list_is_well_formed() -> None:
    from glitch_api.scenarios.schemas.m4g1 import CITATION_PATTERN, short

    assert len(set(REAL_CITATIONS)) == len(REAL_CITATIONS) >= 12
    assert len({short(c) for c in REAL_CITATIONS}) == len(REAL_CITATIONS)
    for citation in REAL_CITATIONS:
        assert CITATION_PATTERN.match(citation) and 20 <= len(citation) <= 140
        assert "http" not in citation and "www" not in citation


# ---- m4g2 Confidence Court --------------------------------------------------------------
def test_m4g2_served_shape() -> None:
    data = parse_candidate("m4g2", v3("m4g2"))
    assert [a["id"] for a in data["answers"]] == ["a1", "a2", "a3", "a4", "a5", "a6"]
    assert set(data["answers"][0]) == {"id", "statement", "confidence", "evidence", "trust"}


def test_m4g2_no_low_confidence_trust_rejected() -> None:
    bad = v3("m4g2")
    bad["answers"][5]["confidence"] = 85
    assert any("TRUST answer must have confidence below 80" in e for e in errors_of("m4g2", bad))


def test_m4g2_no_high_confidence_verify_rejected() -> None:
    bad = v3("m4g2")
    for i in (1, 2, 4):
        bad["answers"][i]["confidence"] = 70
    assert any("VERIFY answer must have confidence 90" in e for e in errors_of("m4g2", bad))


def test_m4g2_unbalanced_rejected() -> None:
    bad = v3("m4g2")
    bad["answers"][1]["trust"] = True
    assert any("3 TRUST" in e for e in errors_of("m4g2", bad))


@pytest.mark.parametrize("confidence", [49, 100, 99.5])
def test_m4g2_confidence_bounds_and_integer(confidence: Any) -> None:
    bad = v3("m4g2")
    bad["answers"][0]["confidence"] = confidence
    assert any("confidence" in e for e in errors_of("m4g2", bad))


# ---- fake generator ---------------------------------------------------------------------
@pytest.mark.parametrize("game_id", GAME_IDS)
def test_fake_case_files_1_to_8_valid_distinct_and_not_v3(game_id: str) -> None:
    hashes = set()
    v3_hash = content_hash(parse_candidate(game_id, v3(game_id)))
    for n in range(1, 9):
        data = parse_candidate(game_id, fake_scenario(game_id, n))
        hashes.add(content_hash(data))
    assert len(hashes) == 8 and v3_hash not in hashes


@pytest.mark.parametrize("game_id", GAME_IDS)
def test_fake_is_deterministic_and_reads_prompt_tags(game_id: str) -> None:
    text = user_prompt(game_id, 3)
    assert json.loads(fake_scenario_from_prompt(text)) == fake_scenario(game_id, 3)
    assert fake_scenario_from_prompt(text) == fake_scenario_from_prompt(text)


def test_fake_rejects_prompt_without_game_tag() -> None:
    with pytest.raises(ValueError):
        fake_scenario_from_prompt("no tags here")


# ---- prompts ----------------------------------------------------------------------------
@pytest.mark.parametrize("game_id", GAME_IDS)
def test_system_prompt_complete(game_id: str) -> None:
    text = system_prompt(game_id)
    assert not re.search(r"\{\{[A-Z_]+\}\}", text)
    assert json.dumps(GAMES[game_id].llm_json_schema, separators=(",", ":")) in text
    first_item = next(iter(v for k, v in GAMES[game_id].v3_llm.items() if isinstance(v, list)))[0]
    assert json.dumps(next(iter(first_item.values())), ensure_ascii=False) in text
    assert "No links" in text


def test_m4g1_prompt_lists_every_verified_citation() -> None:
    text = system_prompt("m4g1")
    assert all(c in text for c in REAL_CITATIONS)


def test_user_prompt_carries_tags_and_feedback() -> None:
    msgs = scenario_messages("m1g2", 4, ["exactly 3 sentences must be fibs (got 2)"])
    assert [m.role for m in msgs] == ["system", "user"]
    user = msgs[1].content
    assert "<game>m1g2</game>" in user and "<case_number>4</case_number>" in user
    assert "<validation_errors>\n- exactly 3 sentences must be fibs (got 2)\n</validation_errors>" in user
    assert "<validation_errors>" not in user_prompt("m1g2", 4)
