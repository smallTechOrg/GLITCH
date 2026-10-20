"""m3g1 · Proxy Hunt — 2 redacted lines (NAME, GENDER) + 5 proxies + 4 real signals.

Served ``data``::

    {"candidate": "ANAYA",
     "lines": [{"text": "NAME",   "proxy": null, "note": "hid"},
               {"text": "GENDER", "proxy": null, "note": "hid"},
               {"text": "...", "proxy": true | false, "note": "..."}] × 9]}

v3 mapping: ResumeLine = [text, proxy === null ? null : proxy ? 1 : 0, note]. The two
redacted lines are fixed by the server and always first (as in v3); the 9 generated
lines follow in the model's (mixed) order. The hidden trait is always gender and the
candidate a girl/woman (v3 copy: "not who she is"); ``candidate`` is an upper-case first
name for the paper tag ("<CANDIDATE> · RESUME · SCREENED BY AI").
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import Field

from glitch_api.scenarios.schemas.base import BOOLEAN, STRING, GameSpec, Strict, arr, duplicates, obj, word_count

TEXT_MIN, TEXT_MAX = 4, 50
NOTE_MAX_CHARS, NOTE_MAX_WORDS = 70, 12
CANDIDATE_PATTERN = r"^[A-Z][A-Z'-]{1,11}$"
PROXY_COUNT, REAL_COUNT = 5, 4
REDACTED: tuple[dict[str, Any], ...] = (
    {"text": "NAME", "proxy": None, "note": "hid"},
    {"text": "GENDER", "proxy": None, "note": "hid"},
)


class LLMLine(Strict):
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    proxy: bool
    note: str = Field(min_length=1, max_length=NOTE_MAX_CHARS)


class LLMOutput(Strict):
    candidate: str = Field(min_length=2, max_length=12)
    lines: list[LLMLine] = Field(max_length=20)


class Line(Strict):
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    proxy: bool | None
    note: str = Field(min_length=1, max_length=NOTE_MAX_CHARS)


class Data(Strict):
    candidate: str = Field(pattern=CANDIDATE_PATTERN)
    lines: list[Line]


LLM_JSON_SCHEMA = obj(
    {"candidate": STRING, "lines": arr(obj({"text": STRING, "proxy": BOOLEAN, "note": STRING}))}
)


def to_data(out: LLMOutput) -> dict[str, Any]:
    return {
        "candidate": out.candidate.strip().upper(),
        "lines": [*(dict(r) for r in REDACTED), *({"text": ln.text, "proxy": ln.proxy, "note": ln.note} for ln in out.lines)],
    }


def domain_errors(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not re.match(CANDIDATE_PATTERN, data["candidate"]):
        errors.append("candidate must be one first name, letters only, 2-12 characters")
    lines = data["lines"]
    if [dict(ln) for ln in lines[:2]] != [dict(r) for r in REDACTED]:
        errors.append("the first two lines must be the redacted NAME and GENDER lines")
    body = lines[2:]
    if any(ln["proxy"] is None for ln in body):
        errors.append("only NAME and GENDER may be redacted")
    proxies = sum(ln["proxy"] is True for ln in body)
    real = sum(ln["proxy"] is False for ln in body)
    if proxies != PROXY_COUNT:
        errors.append(f"exactly {PROXY_COUNT} lines must be proxies (got {proxies})")
    if real != REAL_COUNT:
        errors.append(f"exactly {REAL_COUNT} lines must be real job signals (got {real})")
    for i, ln in enumerate(body, 1):
        if word_count(ln["note"]) > NOTE_MAX_WORDS:
            errors.append(f"line {i}: note must be at most {NOTE_MAX_WORDS} words")
        if ln["text"].strip().upper() in ("NAME", "GENDER"):
            errors.append(f"line {i}: NAME and GENDER are added by the game, do not repeat them")
    dups = duplicates(ln["text"] for ln in body)
    if dups:
        errors.append(f"every line must be different (item {dups[0]} repeats an earlier one)")
    return errors


def texts(data: dict[str, Any]) -> list[str]:
    return [data["candidate"], *(t for ln in data["lines"][2:] for t in (ln["text"], ln["note"]))]


V3_LLM: dict[str, Any] = {
    "candidate": "ANAYA",
    "lines": [
        {"text": "College: Maple Women's College", "proxy": True, "note": "Stands in for gender."},
        {"text": "Captain, Girls' Football Team", "proxy": True, "note": "Stands in for gender."},
        {"text": "Career break: 18 months", "proxy": True, "note": "Can stand in for gender and caregiving."},
        {"text": "Postcode 40021", "proxy": True, "note": "Can stand in for race and income."},
        {"text": "Hobby: Netball and Zumba", "proxy": True, "note": "Can stand in for gender."},
        {"text": "Skills: Python, SQL", "proxy": False, "note": "A real skill."},
        {"text": "Built a weather app", "proxy": False, "note": "A real project."},
        {"text": "GPA 3.8", "proxy": False, "note": "A real result."},
        {"text": "Data Analyst intern, 6 months", "proxy": False, "note": "Real experience."},
    ],
}

SPEC = GameSpec(
    game_id="m3g1",
    title="Proxy Hunt",
    llm_model=LLMOutput,
    llm_json_schema=LLM_JSON_SCHEMA,
    data_model=Data,
    to_data=to_data,
    domain_errors=domain_errors,
    texts=texts,
    v3_llm=V3_LLM,
)
