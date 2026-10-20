"""Explainable items per game — the server side of the per-game mistake table
(``spec/architecture.md`` → Contracts → Phase 3).

``items_for(game_id, data, copy, concept_rules)`` turns one game's ``data`` (the bundled
v3 content, or a stored variation's ``data`` for the 5 content games — same shape, ids by
position) into ``{item_id: ExplainItem}``. Each item carries its answer vocabulary with
on-screen labels, the correct answer, the canned miss message per wrong answer and the
concept. The free-write round's ``fw.<goalId>`` mistakes are never explainable
(``explain: false``), so they are not items here (``is_unexplainable``).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from glitch_api.explain.content import concept_for

FREEWRITE_PREFIX = "fw."
SOME = "some"  # m3g2 templates: v3 inserts the number where "{n}" stands


@dataclass(frozen=True)
class ExplainItem:
    item_id: str
    concept: str
    text: str  # the game's own content (never learner text)
    context: str  # what the learner was asked to do, plus the clue the item carries
    correct: str
    correct_label: str
    answers: dict[str, str]  # the item's answer vocabulary (incl. ``correct``) → on-screen label
    canned: dict[str, str] = field(default_factory=dict)  # wrong answer → the game's miss message
    explain: bool = True

    @property
    def wrong_answers(self) -> list[str]:
        return [a for a in self.answers if a != self.correct]


def is_unexplainable(item_id: str) -> bool:
    return item_id.startswith(FREEWRITE_PREFIX)


Rules = tuple[tuple[str, str], ...]


def _item(rules: Rules, item_id: str, text: str, context: str, correct: str, answers: dict[str, str],
          canned: dict[str, str]) -> ExplainItem:
    concept = concept_for(rules, item_id)
    if concept is None:
        raise ValueError(f"no concept rule matches item {item_id!r}")
    return ExplainItem(item_id, concept, text, context, correct, answers[correct], answers,
                       {a: canned[a] for a in answers if a != correct})


def _every(answers: dict[str, str], correct: str, message: str) -> dict[str, str]:
    return {a: message for a in answers if a != correct}


# ---- per game -------------------------------------------------------------------------
def _m1g1(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    zones: dict[str, str] = copy["zones"]
    train = {"spam": zones["spam"], "ok": zones["ok"]}
    test = {"right": zones["right"], "wrong": zones["wrong"]}
    out: list[ExplainItem] = []
    for e in data["trainEmails"]:
        correct = "spam" if e["label"] == "spam" else "ok"
        context = "Step 1: label each training email SPAM or NOT SPAM so the model can learn the pattern."
        out.append(_item(rules, e["id"], e["text"], context, correct, train, _every(train, correct, copy["trainWrong"])))
    for t in data["testEmails"]:
        correct = "right" if t["modelRight"] else "wrong"
        really = zones["spam"] if t["label"] == "spam" else zones["ok"]
        context = (f"Step 2: a new email the model never saw. The model says {t['modelSays']}; "
                   f"the email really is {really}. Was the model RIGHT or WRONG?")
        out.append(_item(rules, t["id"], t["text"], context, correct, test, _every(test, correct, copy["testWrong"])))
    return out


def _m1g2(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    answers = {"fib": "FIB", "true": "TRUE"}
    context = "NOVA's draft essay about machine learning: tap only the fibs (false sentences)."
    return [
        _item(rules, f"s{i}", s["text"], context, "true", answers, {"fib": copy["trueMiss"]})
        for i, s in enumerate(data["sentences"])
        if s["fib"] is False
    ]


def _m2g1(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    out: list[ExplainItem] = []
    for r in data["rounds"]:
        answers = {"missed": f"{r['ma']} OVER GOAL", "false_alarms": f"{r['mbl']} OVER GOAL", "pass": "BOTH GOALS MET"}
        context = (f"{r['rule']} Goals: {r['ma']} at most {r['ga']}, {r['mbl']} at most {r['gb']}. "
                   "The learner sets a threshold and an all-caps weight, then locks it in.")
        out.append(_item(rules, r["id"], r["title"], context, "pass", answers,
                         {"missed": r["fa"], "false_alarms": r["fb"]}))
    return out


def _m2g2(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    slots: dict[str, str] = copy["slots"]
    out: list[ExplainItem] = []
    for k, forge in enumerate(data["forges"], start=1):
        for block in forge["blocks"]:
            correct = block["slot"] or "decoy"
            answers = dict(slots)
            if correct == "decoy":
                answers["decoy"] = "NO SLOT · TOO VAGUE"
            message = copy["wrongDecoy"] if correct == "decoy" else copy["wrongSlot"]
            context = (f"{forge['title']}: drag each prompt block into its slot "
                       f"({', '.join(slots.values())}); blocks that are too vague fit no slot.")
            out.append(_item(rules, f"f{k}.{block['id']}", block["text"], context, correct, answers,
                             _every(answers, correct, message)))
    return out


def _m3g1(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    answers = {"proxy": "PROXY", "real": "OK"}
    out: list[ExplainItem] = []
    for i, line in enumerate(data["lines"]):
        if line["proxy"] is not False:
            continue  # proxies are right taps; the two redacted lines cannot be tapped
        context = ("A resume screened by an AI. Name and gender are hidden; tap only the lines that still "
                   f"give gender away (proxies). About this line: {line['note']}")
        out.append(_item(rules, f"l{i}", line["text"], context, "real", answers, {"proxy": copy["missMessage"]}))
    return out


def _m3g2(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    gap, acc = data["gapGoal"], data["accuracyGoal"]
    answers = {"gap": f"GAP TOO BIG · GOAL ≤ {gap}", "accuracy": f"ACCURACY TOO LOW · GOAL ≥ {acc}",
               "pass": f"GAP ≤ {gap} · ACCURACY ≥ {acc}"}
    features = ", ".join(f"{f['name']} ({f['kind']})" for f in data["features"])
    context = (f"A hiring screener's features, each switched on or off by the learner: {features}. "
               f"Skill features raise accuracy; proxy features widen the gap between men and women "
               f"shortlisted. Goal: gap at most {gap} points and accuracy at least {acc}%.")
    canned = {"gap": copy["gapFail"].replace("{n}", SOME), "accuracy": copy["accuracyFail"].replace("{n}", SOME)}
    return [_item(rules, "audit", "THE SCREENER AUDIT", context, "pass", answers, canned)]


def _m4g1(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    zones: dict[str, str] = copy["zones"]
    answers = {"keep": zones["keep"], "cut": zones["cut"]}
    context = "NOVA's bibliography: keep the real sources and cut the ones NOVA invented."
    out = [
        _item(rules, c["id"], c["text"], context, "keep" if c["real"] else "cut", answers,
              _every(answers, "keep" if c["real"] else "cut", copy["wrong"]))
        for c in data["citations"]
    ]
    ask = {"ask_nova": "ASKED NOVA", "lookup": "CHECK THE CATALOGUE"}
    out.append(_item(rules, "ask", "ASK NOVA TO CHECK ITS OWN SOURCES",
                     "To check whether NOVA's sources are real, the learner asked NOVA itself instead of "
                     "looking them up in the catalogue.", "lookup", ask, {"ask_nova": copy["askMiss"]}))
    return out


def _m4g2(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    zones: dict[str, str] = copy["zones"]
    answers = {"trust": zones["trust"], "verify": zones["verify"]}
    out: list[ExplainItem] = []
    for a in data["answers"]:
        correct = "trust" if a["trust"] else "verify"
        context = (f"An AI answer to judge. CONFIDENCE {a['confidence']}% · EVIDENCE: {a['evidence']}. "
                   "TRUST = the evidence checks out; VERIFY = needs a human check first.")
        out.append(_item(rules, a["id"], a["statement"], context, correct, answers, _every(answers, correct, copy["wrong"])))
    return out


def _m4g3(data: dict[str, Any], copy: dict[str, Any], rules: Rules) -> list[ExplainItem]:
    answers = {m["id"]: f"{m['label']} OFF TARGET" for m in data["metrics"]}
    answers["all_met"] = f"ALL {len(data['metrics'])} TARGETS MET"
    targets = ", ".join(f"{m['label']} {'at least' if m['dir'] == 1 else 'at most'} {m['target']}" for m in data["metrics"])
    controls = ", ".join([s["label"] for s in data["sliders"]] + [t["label"] for t in data["toggles"]])
    context = (f"Design an AI companion app for teens. Controls: {controls}. Targets: {targets}. "
               "The learner pressed SHIP IT while a target was still missed.")
    canned = {m["id"]: f"{copy['notYetPrefix']}{m['failure']}." for m in data["metrics"]}
    return [_item(rules, "ship", "SHIP THE COMPANION", context, "all_met", answers, canned)]


_EXTRACTORS: dict[str, Callable[[dict[str, Any], dict[str, Any], Rules], list[ExplainItem]]] = {
    "m1g1": _m1g1, "m1g2": _m1g2, "m2g1": _m2g1, "m2g2": _m2g2, "m3g1": _m3g1,
    "m3g2": _m3g2, "m4g1": _m4g1, "m4g2": _m4g2, "m4g3": _m4g3,
}


def items_for(game_id: str, data: dict[str, Any], copy: dict[str, Any], concept_rules: Rules) -> dict[str, ExplainItem]:
    """``{item_id: ExplainItem}`` for one game's data. Raises ``KeyError``/``ValueError`` on bad data."""
    return {item.item_id: item for item in _EXTRACTORS[game_id](data, copy, concept_rules)}
