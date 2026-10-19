"""Lever cue rules (spec/capabilities/freewrite-forge.md → Lever cue rules)."""

from __future__ import annotations

import pytest

from glitch_api.heuristics.levers import ALL_FIVE_TIP, CANNED_TIPS, LEVER_ORDER, canned_tip, evaluate_levers, first_missed

STRONG = (
    "Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, "
    "who loves plants. Use 3 short bullet points. Keep it under 80 words."
)


def test_levers_spec_strong_fixture_hits_all_five() -> None:
    assert evaluate_levers(STRONG) == {"task": True, "context": True, "role": True, "format": True, "limit": True}


@pytest.mark.parametrize("prompt", ["plants", "Tell me about plants", "", "   "])
def test_levers_spec_weak_fixtures_hit_none(prompt: str) -> None:
    assert sum(evaluate_levers(prompt).values()) == 0


def test_levers_task_needs_five_words() -> None:
    assert evaluate_levers("Explain photosynthesis to kids")["task"] is False  # 4 words
    assert evaluate_levers("Explain photosynthesis to young kids")["task"] is True


@pytest.mark.parametrize(
    ("prompt", "lever"),
    [
        ("i'm studying", "context"),
        ("pretend you are a pirate", "role"),
        ("as a history tutor", "role"),
        ("give it as a TABLE", "format"),
        ("Q&A please", "format"),
        ("at most a few", "limit"),
        ("in 3 sentences", "limit"),
        ("in 10 minutes", "limit"),
    ],
)
def test_levers_each_cue_matches_case_insensitively(prompt: str, lever: str) -> None:
    assert evaluate_levers(prompt)[lever] is True


def test_levers_word_boundaries_avoid_false_hits() -> None:
    levers = evaluate_levers("mystery shortbread listing")  # "my"/"short"/"list" only inside words
    assert levers["context"] is False
    assert levers["limit"] is False
    assert levers["format"] is False


def test_canned_tip_names_first_missed_lever_in_order() -> None:
    levers = {"task": True, "context": True, "role": False, "format": False, "limit": True}
    assert first_missed(levers) == "role"
    assert canned_tip(levers) == CANNED_TIPS["role"]


def test_canned_tip_praises_when_nothing_missed() -> None:
    assert canned_tip({lever: True for lever in LEVER_ORDER}) == ALL_FIVE_TIP


def test_canned_tips_are_one_short_sentence() -> None:
    for tip in [*CANNED_TIPS.values(), ALL_FIVE_TIP]:
        assert len(tip.split()) <= 25
        assert len(tip) <= 200
