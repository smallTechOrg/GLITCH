"""Output moderation: fail-closed blocklist, leak patterns, link stripping."""

from __future__ import annotations

import pytest

from glitch_api.moderation.filter import LINK_REPLACEMENT, check, strip_links


@pytest.mark.parametrize(
    "text",
    [
        "Plants make food from sunlight.",
        "Scunthorpe is a town; hello class, assess the shitake mushroom? no: shiitake.",
        "Pass the assessment with a classic approach.",
    ],
)
def test_moderation_allows_clean_text(text: str) -> None:
    assert check(text).allowed is True


@pytest.mark.parametrize("text", ["What the FUCK is that", "this is shit", "you fucking legend", "sh1t happens"])
def test_moderation_blocks_profanity_including_prefix_and_leet(text: str) -> None:
    verdict = check(text)
    assert verdict.allowed is False
    assert verdict.category == "blocklist"


def test_moderation_blocks_prompt_delimiter_leak() -> None:
    assert check("Sure! <learner_prompt>secret</learner_prompt>").category == "prompt_leak"


def test_moderation_blocks_key_shaped_strings() -> None:
    assert check("my key is sk-or-v1-abcdef0123456789").category == "secret_leak"


def test_moderation_verdict_never_contains_matched_text() -> None:
    verdict = check("this is shit")
    assert "shit" not in repr(verdict)


@pytest.mark.parametrize(
    "text",
    ["see https://example.com/page?x=1 now", "go to www.example.org", "visit plants.com/learn today"],
)
def test_strip_links_replaces_urls(text: str) -> None:
    out = strip_links(text)
    assert LINK_REPLACEMENT in out
    assert "example" not in out and "plants.com" not in out


def test_strip_links_keeps_plain_sentences() -> None:
    text = "Photosynthesis happens in leaves. It needs light, water and CO2."
    assert strip_links(text) == text
