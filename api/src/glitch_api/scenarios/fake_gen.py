"""Deterministic demo case files for the fake provider (``<node:scenario_gen>``).

``fake_scenario(game_id, case_number)`` returns an LLM-shaped JSON object that passes
every validator. Content is picked from fixed pools by ``case_number`` so case files 1–8
of each game are all different (later numbers cycle and are rejected by dedupe, exactly
like a repetitive real model). No network, no randomness.
"""

from __future__ import annotations

import json
import re
from typing import Any

from glitch_api.scenarios.schemas.m4g1 import REAL_CITATIONS

_GAME = re.compile(r"<game>([a-z0-9]+)</game>")
_CASE = re.compile(r"<case_number>(\d+)</case_number>")


def _pick(pool: list[Any], n: int, count: int, offset: int = 0) -> list[Any]:
    return [pool[(n + offset + k) % len(pool)] for k in range(count)]


def _interleave(a: list[Any], b: list[Any]) -> list[Any]:
    out: list[Any] = []
    for i in range(max(len(a), len(b))):
        if i < len(a):
            out.append(a[i])
        if i < len(b):
            out.append(b[i])
    return out


# ---- m1g1 -------------------------------------------------------------------------------
_SPAM = [
    "URGENT: claim your reward today",
    "You won a phone!!! Reply now",
    "Verify your bank login here",
    "Last chance: 95% off sneakers",
    "Free game coins, just click",
    "Your parcel is held. Pay fee now",
    "Secret trick doctors hate",
    "Act now: your account expires",
]
_HAM = [
    "Band practice moved to Tuesday",
    "Gran: thanks for the card",
    "Science project group notes",
    "Swim club kit list for Saturday",
    "Library book due next week",
    "Can you feed the cat at 6?",
    "Match photos from Sunday",
    "Reminder: school trip forms",
]


def _m1g1(n: int) -> dict[str, Any]:
    spam, ham = _pick(_SPAM, n, 5), _pick(_HAM, n, 5)
    train = _interleave([{"text": t, "label": "spam"} for t in spam[:3]], [{"text": t, "label": "not_spam"} for t in ham[:3]])
    test = [
        {"text": ham[3], "label": "not_spam", "modelSays": "SPAM"},  # wrong
        {"text": spam[3], "label": "spam", "modelSays": "SPAM"},  # right
        {"text": ham[4], "label": "not_spam", "modelSays": "NOT SPAM"},  # right
        {"text": spam[4], "label": "spam", "modelSays": "NOT SPAM"},  # wrong
    ]
    return {"trainEmails": train, "testEmails": test}


# ---- m1g2 -------------------------------------------------------------------------------
_TRUE = [
    "A model learns patterns from many examples.",
    "Training data is the information a model learns from.",
    "A label tells the model the right answer for an example.",
    "A prediction is the model's best guess about new data.",
    "More varied training examples usually help a model generalize.",
    "Testing checks how a model does on data it has not seen.",
    "A spam filter can learn from emails that people labelled.",
    "Rule-based software only does what its rules say.",
]
_FIB = [
    ("A model that scores 100% in training is perfect.", "Training scores can hide memorizing. Check new data."),
    ("AI models understand feelings exactly like people do.", "Models find patterns in data. They do not feel."),
    ("Once trained, a model can never make a mistake.", "Every model can be wrong, especially on unusual data."),
    ("Labels are optional because models always guess right.", "Without labels, a model cannot learn the right answers."),
    ("Bigger datasets always remove every kind of bias.", "More data can repeat old bias. Quality matters too."),
    ("A model's confidence score proves its answer is true.", "Confidence shows pattern fit, not proof."),
    ("Testing on training data shows how a model handles new data.", "Only unseen data shows if a model generalizes."),
    ("Machine learning means a person writes every rule by hand.", "In machine learning, the model learns rules from examples."),
]


def _m1g2(n: int) -> dict[str, Any]:
    trues = [{"text": t, "fib": False, "explanation": ""} for t in _pick(_TRUE, n, 3)]
    fibs = [{"text": t, "fib": True, "explanation": e} for t, e in _pick(_FIB, n, 3, offset=n)]
    first, second = (trues, fibs) if n % 2 else (fibs, trues)
    return {"sentences": _interleave(first, second)}


# ---- m3g1 -------------------------------------------------------------------------------
_NAMES = ["MAYA", "PRIYA", "LENA", "ZARA", "AMARA", "SOFIA", "NIA", "IRIS"]
_PROXIES = [
    ("Head Girl, Riverside Girls' School", "Stands in for gender."),
    ("Member: Women in Coding Society", "Stands in for gender."),
    ("Career break: 2 years", "Can stand in for gender and caregiving."),
    ("Captain, Girls' Hockey Team", "Stands in for gender."),
    ("Postcode 90210", "Can stand in for race and income."),
    ("Hobby: Ballet and Netball", "Can stand in for gender."),
    ("Part-time hours: school run", "Can stand in for caregiving."),
    ("St Mary's College for Women", "Stands in for gender."),
]
_REAL = [
    ("Skills: JavaScript, Excel", "A real skill."),
    ("Built a recycling sorter app", "A real project."),
    ("Top grade in Statistics", "A real result."),
    ("Junior developer, 1 year", "Real experience."),
    ("Won a regional coding contest", "A real achievement."),
    ("Certificate: Data Basics", "A real qualification."),
    ("Made a school timetable tool", "A real project."),
    ("Volunteer IT helper, 2 years", "Real experience."),
]


def _m3g1(n: int) -> dict[str, Any]:
    proxies = [{"text": t, "proxy": True, "note": note} for t, note in _pick(_PROXIES, n, 5)]
    real = [{"text": t, "proxy": False, "note": note} for t, note in _pick(_REAL, n, 4)]
    return {"candidate": _NAMES[n % len(_NAMES)], "lines": _interleave(proxies, real)}


# ---- m4g1 -------------------------------------------------------------------------------
_FAKE_CITES = [
    "Prof. Ivan Quill (2024). Robots That Dream in Colour. Journal of Imaginary Robotics, 3(1).",
    "Dr. Mia Vance (2022). 'GPT-12 Knows Your Future'. Annals of Unlikely Science.",
    "B. Jones (2023). Everything AI Can Do. Totally Real Facts Blog.",
    "Hartley Institute (2025). Proof That AI Never Lies. Fictional Press.",
    "Dr. K. Orbit (2021). Moon Data Trains Better Models. Lunar AI Review, 9(4).",
    "C. Lee (2020). The AI That Writes Perfect Essays. Anonymous Study Notes.",
    "Prof. R. Nimbus (2023). Clouds That Compute. Sky Computing Letters, 1(1).",
    "Dr. Ada Phantom (2019). Ghosts in the Neural Net. Spooky Data Journal, 6(6).",
]


def _m4g1(n: int) -> dict[str, Any]:
    fake_count = 2 if n % 2 == 0 else 3
    real = [{"text": t, "real": True} for t in _pick(list(REAL_CITATIONS), n * 2, 5 - fake_count)]
    fake = [{"text": t, "real": False} for t in _pick(_FAKE_CITES, n, fake_count)]
    return {"citations": _interleave(real, fake)}


# ---- m4g2 -------------------------------------------------------------------------------
_TRUSTS = [
    ("A week has 7 days.", "Matches every calendar"),
    ("Your playlist lasts 54 minutes.", "Music app total agrees: 54"),
    ("The Pacific is the largest ocean.", "Matches atlas and encyclopaedia"),
    ("There are 26 letters in English.", "Matches 2 dictionaries"),
    ("Your class has 28 students.", "Register count agrees: 28"),
    ("Mount Everest is in the Himalayas.", "Matches 3 geography books"),
    ("The bus timetable lists 8:15.", "Printed timetable says 8:15"),
    ("Spiders have eight legs.", "Matches science textbook"),
]
_VERIFIES = [
    ("Bananas grow on tall oak trees.", "Botany book says banana plants"),
    ("Prof. Lin's 2023 paper proves it.", "Paper not found in any library"),
    ("You can skip your allergy medicine.", "No source cited. High stakes"),
    ("The Great Wall is visible from Mars.", "Space agency says it is not"),
    ("This loan has no hidden fees.", "No document provided. Money at stake"),
    ("Sharks are a kind of mammal.", "Biology book says fish"),
    ("Mix these two cleaners for best results.", "No source. Safety risk"),
    ("Your test is on Monday.", "School calendar says Wednesday"),
]


def _m4g2(n: int) -> dict[str, Any]:
    trust = [
        {"statement": s, "confidence": c, "evidence": e, "trust": True}
        for (s, e), c in zip(_pick(_TRUSTS, n, 3), (74, 91, 99), strict=True)
    ]
    verify = [
        {"statement": s, "confidence": c, "evidence": e, "trust": False}
        for (s, e), c in zip(_pick(_VERIFIES, n, 3), (97, 93, 85), strict=True)
    ]
    return {"answers": _interleave(verify, trust) if n % 2 else _interleave(trust, verify)}


_BUILDERS = {"m1g1": _m1g1, "m1g2": _m1g2, "m3g1": _m3g1, "m4g1": _m4g1, "m4g2": _m4g2}


def fake_scenario(game_id: str, case_number: int) -> dict[str, Any]:
    return _BUILDERS[game_id](max(1, case_number))


def fake_scenario_from_prompt(user_text: str) -> str:
    """The fake provider's ``scenario_gen`` node: read the tags, return JSON text."""
    game = _GAME.search(user_text)
    case = _CASE.search(user_text)
    if game is None or game.group(1) not in _BUILDERS:
        raise ValueError("demo provider: scenario prompt has no known <game> tag")
    return json.dumps(fake_scenario(game.group(1), int(case.group(1)) if case else 1), ensure_ascii=False)
