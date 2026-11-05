"""m4g1 · Source Detective — 5 citations, 2–3 of them invented.

Served ``data``::

    {"citations": [{"id": "c1", "text": "Author (Year). Title. Venue.", "real": bool}] × 5}

v3 mapping: [id, text, real ? 1 : 0]; the web derives ``short = text.split(" (")[0]``.

Truth guard: an LLM cannot be trusted to know which sources exist (that is this game's
lesson). Every ``real: true`` citation must be copied verbatim from ``REAL_CITATIONS`` — a
hand-checked list of sources that exist — and every invented one must not match any of
them (not even the author part). The v3 exemplar has its two web addresses removed,
because generated content may not contain links (moderation rejects them).
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import Field

from glitch_api.scenarios.schemas.base import BOOLEAN, STRING, GameSpec, Strict, arr, duplicates, obj

TEXT_MIN, TEXT_MAX = 20, 140
CITATION_COUNT = 5
FAKE_MIN, FAKE_MAX = 2, 3
CITATION_PATTERN = re.compile(r"^.+? \((?:19|20)\d{2}\)\. .+$")

# Hand-checked: every entry is a real, catalogued publication. Format "Author (Year). Title. Venue."
REAL_CITATIONS: tuple[str, ...] = (
    "UNESCO (2021). Recommendation on the Ethics of Artificial Intelligence. Paris.",
    "Bender et al. (2021). On the Dangers of Stochastic Parrots. ACM FAccT.",
    "OECD (2019). OECD Principles on AI. Paris.",
    "Turing (1950). Computing Machinery and Intelligence. Mind, 59(236).",
    "Buolamwini & Gebru (2018). Gender Shades. Proceedings of Machine Learning Research, 81.",
    "NIST (2023). Artificial Intelligence Risk Management Framework (AI RMF 1.0). Gaithersburg.",
    "Vaswani et al. (2017). Attention Is All You Need. NeurIPS.",
    "Obermeyer et al. (2019). Dissecting racial bias in an algorithm used to manage the health of populations. Science.",
    "UNICEF (2021). Policy Guidance on AI for Children. New York.",
    "European Union (2024). Regulation (EU) 2024/1689, the Artificial Intelligence Act. Official Journal of the EU.",
    "Russell & Norvig (2020). Artificial Intelligence: A Modern Approach, 4th ed. Pearson.",
    "Weizenbaum (1966). ELIZA. Communications of the ACM, 9(1).",
    "Angwin et al. (2016). Machine Bias. ProPublica.",
    "LeCun, Bengio & Hinton (2015). Deep Learning. Nature, 521.",
    "The White House OSTP (2022). Blueprint for an AI Bill of Rights. Washington, DC.",
)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().rstrip(".").lower())


def short(text: str) -> str:
    """The web's ``text.split(" (")[0]`` — the author part."""
    return text.split(" (")[0]


_REAL_BY_NORM = {_norm(c): c for c in REAL_CITATIONS}
_REAL_AUTHORS = {_norm(short(c)) for c in REAL_CITATIONS}


class LLMCitation(Strict):
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    real: bool


class LLMOutput(Strict):
    citations: list[LLMCitation] = Field(max_length=20)


class Citation(Strict):
    id: str = Field(pattern=r"^c[1-5]$")
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    real: bool


class Data(Strict):
    citations: list[Citation]


LLM_JSON_SCHEMA = obj({"citations": arr(obj({"text": STRING, "real": BOOLEAN}))})


def to_data(out: LLMOutput) -> dict[str, Any]:
    citations = []
    for i, c in enumerate(out.citations, 1):
        # Real ones are snapped to the canonical list spelling (whitespace/case/period drift).
        text = _REAL_BY_NORM.get(_norm(c.text), c.text) if c.real else c.text
        citations.append({"id": f"c{i}", "text": text, "real": c.real})
    return {"citations": citations}


def domain_errors(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    citations = data["citations"]
    if len(citations) != CITATION_COUNT:
        errors.append(f"citations must have exactly {CITATION_COUNT} items (got {len(citations)})")
    fakes = sum(not c["real"] for c in citations)
    if not FAKE_MIN <= fakes <= FAKE_MAX:
        errors.append(f"{FAKE_MIN} or {FAKE_MAX} citations must be invented (real=false) (got {fakes})")
    for i, c in enumerate(citations, 1):
        if not CITATION_PATTERN.match(c["text"]):
            errors.append(f"citation {i} must look like 'Author (Year). Title. Venue.'")
        if c["real"] and _norm(c["text"]) not in _REAL_BY_NORM:
            errors.append(f"citation {i} is marked real but is not copied exactly from the list of real sources")
        if not c["real"]:
            if _norm(c["text"]) in _REAL_BY_NORM:
                errors.append(f"citation {i} is marked invented but is a real source")
            elif _norm(short(c["text"])) in _REAL_AUTHORS:
                errors.append(f"citation {i} is invented but uses a real source's author; invent the author too")
    dups = duplicates(c["text"] for c in citations)
    if dups:
        errors.append(f"every citation must be different (item {dups[0]} repeats an earlier one)")
    author_dups = duplicates(short(c["text"]) for c in citations)
    if author_dups and not dups:
        errors.append(f"every citation needs a different author (item {author_dups[0]} repeats an earlier author)")
    return errors


def texts(data: dict[str, Any]) -> list[str]:
    return [c["text"] for c in data["citations"]]


V3_LLM: dict[str, Any] = {
    "citations": [
        {"text": "UNESCO (2021). Recommendation on the Ethics of Artificial Intelligence. Paris.", "real": True},
        {"text": "Dr. Elena Marsh (2023). 'Why GPT-9 Reads Minds'. Journal of Imaginary Science, 14(2).", "real": False},
        {"text": "Bender et al. (2021). On the Dangers of Stochastic Parrots. ACM FAccT.", "real": True},
        {"text": "A. Smith (2022). AI Facts Everyone Knows. Totally True Blog.", "real": False},
        {"text": "OECD (2019). OECD Principles on AI. Paris.", "real": True},
    ]
}

SPEC = GameSpec(
    game_id="m4g1",
    title="Source Detective",
    llm_model=LLMOutput,
    llm_json_schema=LLM_JSON_SCHEMA,
    data_model=Data,
    to_data=to_data,
    domain_errors=domain_errors,
    texts=texts,
    v3_llm=V3_LLM,
)
