"""Bundled v3 content JSON (spec/data.md → v3 content JSON) + the per-game item extractor
(spec/architecture.md → Contracts → Phase 3 → per-game mistake table)."""

from __future__ import annotations

import pytest

from glitch_api.explain.content import GAME_IDS, VARIATION_GAMES, concept_for, content_for, load_all
from glitch_api.explain.items import items_for
from glitch_api.scenarios.fake_gen import fake_scenario
from glitch_api.scenarios.schemas import parse_candidate

CONCEPTS_BY_GAME = {
    "m1g1": {"Training data", "Generalization"},
    "m1g2": {"Machine learning"},
    "m2g1": {"Weights and thresholds", "Classification"},
    "m2g2": {"Prompt engineering"},
    "m3g1": {"Proxy variables"},
    "m3g2": {"Algorithmic discrimination"},
    "m4g1": {"Hallucination", "Verification"},
    "m4g2": {"Verification"},
    "m4g3": {"Human oversight"},
}

EXPECTED_IDS = {
    "m1g1": {"e1", "e2", "e3", "e4", "e5", "e6", "t1", "t2", "t3", "t4"},
    "m1g2": {"s0", "s2", "s4"},  # the true sentences (tapping a fib is right)
    "m2g1": {"r1", "r2"},
    "m2g2": {f"f{k}.b{i}" for k in (1, 2) for i in range(8)},
    "m3g1": {"l7", "l8", "l9", "l10"},  # real lines only; l0/l1 redacted, l2–l6 proxies
    "m3g2": {"audit"},
    "m4g1": {"c1", "c2", "c3", "c4", "c5", "ask"},
    "m4g2": {"a1", "a2", "a3", "a4", "a5", "a6"},
    "m4g3": {"ship"},
}


def _items(game_id: str):
    c = content_for(game_id)
    return items_for(game_id, c.data, c.copy, c.concept_rules)


def test_all_nine_files_load_with_their_game_id() -> None:
    loaded = load_all()
    assert tuple(loaded) == GAME_IDS
    for game_id, content in loaded.items():
        assert content.game_id == game_id and content.data and content.concept_rules


@pytest.mark.parametrize("game_id", GAME_IDS)
def test_every_item_has_correct_answer_wrong_answers_canned_and_concept(game_id: str) -> None:
    items = _items(game_id)
    assert set(items) == EXPECTED_IDS[game_id]
    for item in items.values():
        assert item.correct in item.answers and item.correct_label == item.answers[item.correct]
        assert len(item.wrong_answers) >= 1
        assert set(item.canned) == set(item.wrong_answers)
        assert all(m.strip() for m in item.canned.values())
        assert item.concept in CONCEPTS_BY_GAME[game_id]
        assert item.text and item.context and item.explain is True
        assert all(len(a) <= 24 and a.replace("_", "").isalpha() and a.islower() for a in item.answers)


def test_table_derivations_match_the_v3_data() -> None:
    m1g1 = _items("m1g1")
    assert m1g1["e1"].correct == "spam" and m1g1["e2"].correct == "ok" and m1g1["e1"].concept == "Training data"
    assert m1g1["t1"].correct == "wrong" and m1g1["t2"].correct == "right" and m1g1["t1"].concept == "Generalization"
    assert m1g1["e1"].canned["ok"].startswith("Look at the features")
    assert m1g1["t1"].answers == {"right": "RIGHT", "wrong": "WRONG"}

    s0 = _items("m1g2")["s0"]
    assert (s0.correct, s0.correct_label, s0.answers["fib"]) == ("true", "TRUE", "FIB")
    assert s0.canned == {"fib": "That one is actually true. Look for something that sounds too sure."}

    r1, r2 = _items("m2g1")["r1"], _items("m2g1")["r2"]
    assert r1.answers == {"missed": "EMERGENCIES MISSED OVER GOAL", "false_alarms": "FALSE ALARMS OVER GOAL",
                          "pass": "BOTH GOALS MET"}
    assert r1.canned["missed"] == "A real emergency was missed. Lower the threshold."
    assert (r1.concept, r2.concept) == ("Weights and thresholds", "Classification")

    m2g2 = _items("m2g2")
    decoy, task = m2g2["f1.b0"], m2g2["f1.b1"]
    assert decoy.correct == "decoy" and decoy.correct_label == "NO SLOT · TOO VAGUE"
    assert set(decoy.wrong_answers) == {"task", "ctx", "role", "fmt", "lim"}
    assert decoy.canned["task"] == "That block is too vague. Look for a specific one."
    assert task.correct == "task" and "task" not in task.canned and task.canned["ctx"].startswith("That block is a different")

    l7 = _items("m3g1")["l7"]
    assert (l7.text, l7.correct, l7.answers) == ("Skills: Python, SQL", "real", {"proxy": "PROXY", "real": "OK"})

    audit = _items("m3g2")["audit"]
    assert audit.canned["gap"] == "The gap is still some points. Some proxies are still switched on."
    assert audit.canned["accuracy"] == "Accuracy fell to some%. Keep the skill features on."
    assert audit.correct == "pass"

    m4g1 = _items("m4g1")
    assert m4g1["c2"].correct == "cut" and m4g1["c1"].correct == "keep"
    assert (m4g1["ask"].correct, m4g1["ask"].concept, m4g1["ask"].answers["ask_nova"]) == ("lookup", "Verification", "ASKED NOVA")
    assert m4g1["c1"].concept == "Hallucination"

    assert _items("m4g2")["a6"].correct == "trust" and _items("m4g2")["a2"].correct == "verify"

    ship = _items("m4g3")["ship"]
    assert ship.correct == "all_met" and ship.correct_label == "ALL 5 TARGETS MET"
    assert ship.answers["well"] == "WELLBEING OFF TARGET"
    assert ship.canned["well"] == "Not yet: wellbeing is too low."


@pytest.mark.parametrize("game_id", sorted(VARIATION_GAMES))
def test_variation_data_uses_the_same_extractor(game_id: str) -> None:
    c = content_for(game_id)
    data = parse_candidate(game_id, fake_scenario(game_id, 1))
    items = items_for(game_id, data, c.copy, c.concept_rules)
    assert items, "a variation has explainable items"
    for item in items.values():
        assert item.wrong_answers and item.concept in CONCEPTS_BY_GAME[game_id]


def test_concept_rules_first_prefix_wins() -> None:
    rules = (("r2", "Classification"), ("", "Weights and thresholds"))
    assert concept_for(rules, "r2") == "Classification"
    assert concept_for(rules, "r1") == "Weights and thresholds"
    assert concept_for((("e", "Training data"),), "zzz") is None
