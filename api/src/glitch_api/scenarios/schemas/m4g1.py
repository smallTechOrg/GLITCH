"""m4g1 · Source Detective — 5 citations, 2–3 of them invented.

Served ``data``::

    {"citations": [{"id": "c1", "text": "Author (Year). Title. Venue.", "real": bool, "excerpt": "..."}] × 5}

v3 mapping: [id, text, real ? 1 : 0, excerpt]; the web derives ``short = text.split(" (")[0]``.

Truth guard: an LLM cannot be trusted to know which sources exist (that is this game's
lesson). Every ``real: true`` citation must be copied verbatim from ``REAL_CITATIONS`` — a
hand-checked list of sources that exist — and every invented one must not match any of
them (not even the author part). The same goes for what a source says: a real citation's
``excerpt`` always comes from ``REAL_CITATIONS``, never from the model. The v3 exemplar has
its two web addresses removed, because generated content may not contain links (moderation
rejects them).

Case files stored before excerpts existed fail validation on read and are skipped.
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

# Hand-checked: every entry is a real, catalogued publication, with a hand-written summary of
# what it says. Citation format "Author (Year). Title. Venue."
REAL_EXCERPTS: dict[str, str] = {
    "UNESCO (2021). Recommendation on the Ethics of Artificial Intelligence. Paris.":
        "Adopted by UNESCO's 193 member states, this global standard sets out values for AI, including human rights, transparency and human oversight.",
    "Bender et al. (2021). On the Dangers of Stochastic Parrots. ACM FAccT.":
        "Asks whether language models can get too big, weighing their environmental costs, biased training data and the illusion of meaning in their output.",
    "OECD (2019). OECD Principles on AI. Paris.":
        "Principles agreed between governments: AI should benefit people and the planet, respect human rights, and stay transparent, robust and accountable.",
    "Turing (1950). Computing Machinery and Intelligence. Mind, 59(236).":
        "Opens with the question 'Can machines think?', then replaces it with a test of behaviour: the imitation game.",
    "Buolamwini & Gebru (2018). Gender Shades. Proceedings of Machine Learning Research, 81.":
        "Audits commercial gender classifiers and finds far higher error rates for darker-skinned women than for lighter-skinned men.",
    "NIST (2023). Artificial Intelligence Risk Management Framework (AI RMF 1.0). Gaithersburg.":
        "A voluntary framework built around four functions, Govern, Map, Measure and Manage, to help organisations handle AI risks.",
    "Vaswani et al. (2017). Attention Is All You Need. NeurIPS.":
        "Proposes the Transformer, a network architecture based on attention that drops recurrence and convolutions.",
    "Obermeyer et al. (2019). Dissecting racial bias in an algorithm used to manage the health of populations. Science.":
        "Finds a widely used US health algorithm underestimated Black patients' needs because it used past health costs as a stand-in for need.",
    "UNICEF (2021). Policy Guidance on AI for Children. New York.":
        "Sets requirements for child-centred AI, such as supporting children's development, inclusion, fairness, privacy and safety.",
    "European Union (2024). Regulation (EU) 2024/1689, the Artificial Intelligence Act. Official Journal of the EU.":
        "Sets EU-wide rules that sort AI systems by risk, banning some practices and placing duties on high-risk systems.",
    "Russell & Norvig (2020). Artificial Intelligence: A Modern Approach, 4th ed. Pearson.":
        "A university textbook covering search, knowledge, planning, machine learning and the ethics of artificial intelligence.",
    "Weizenbaum (1966). ELIZA. Communications of the ACM, 9(1).":
        "Describes a program that lets a person converse with a computer in natural language, using keyword rules and scripted replies.",
    "Angwin et al. (2016). Machine Bias. ProPublica.":
        "Investigates COMPAS risk scores and reports Black defendants were more often wrongly flagged as high risk than white defendants.",
    "LeCun, Bengio & Hinton (2015). Deep Learning. Nature, 521.":
        "A review explaining how deep learning uses many layers and backpropagation to learn representations from raw data.",
    "The White House OSTP (2022). Blueprint for an AI Bill of Rights. Washington, DC.":
        "Sets out five principles, including safe systems, protection from algorithmic discrimination, data privacy, notice and human alternatives.",
}
REAL_CITATIONS: tuple[str, ...] = tuple(REAL_EXCERPTS)
EXCERPT_MIN, EXCERPT_MAX = 30, 200


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
    excerpt: str = Field(max_length=EXCERPT_MAX)  # empty on real citations: the server fills those in


class LLMOutput(Strict):
    citations: list[LLMCitation] = Field(max_length=20)


class Citation(Strict):
    id: str = Field(pattern=r"^c[1-5]$")
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    real: bool
    excerpt: str = Field(max_length=EXCERPT_MAX)


class Data(Strict):
    citations: list[Citation]


LLM_JSON_SCHEMA = obj({"citations": arr(obj({"text": STRING, "real": BOOLEAN, "excerpt": STRING}))})


def to_data(out: LLMOutput) -> dict[str, Any]:
    citations = []
    for i, c in enumerate(out.citations, 1):
        # Real ones are snapped to the canonical list spelling (whitespace/case/period drift).
        text = _REAL_BY_NORM.get(_norm(c.text), c.text) if c.real else c.text
        excerpt = REAL_EXCERPTS.get(text, c.excerpt) if c.real else c.excerpt
        citations.append({"id": f"c{i}", "text": text, "real": c.real, "excerpt": excerpt})
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
        elif c["real"] and c["excerpt"] != REAL_EXCERPTS.get(_REAL_BY_NORM[_norm(c["text"])]):
            errors.append(f"citation {i} is real but its excerpt is not the verified summary")
        if not c["real"]:
            if len(c["excerpt"].strip()) < EXCERPT_MIN:
                errors.append(f"citation {i} is invented and needs an excerpt of {EXCERPT_MIN}-{EXCERPT_MAX} characters")
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
    return [t for c in data["citations"] for t in (c["text"], c["excerpt"])]


V3_LLM: dict[str, Any] = {
    "citations": [
        {"text": "UNESCO (2021). Recommendation on the Ethics of Artificial Intelligence. Paris.", "real": True, "excerpt": ""},
        {
            "text": "Dr. Elena Marsh (2023). 'Why GPT-9 Reads Minds'. Journal of Imaginary Science, 14(2).",
            "real": False,
            "excerpt": "Our team proved GPT-9 reads human thoughts with 100% accuracy. For security reasons, no data or method can be shared.",
        },
        {"text": "Bender et al. (2021). On the Dangers of Stochastic Parrots. ACM FAccT.", "real": True, "excerpt": ""},
        {
            "text": "A. Smith (2022). AI Facts Everyone Knows. Totally True Blog.",
            "real": False,
            "excerpt": "Everybody knows AI never makes mistakes. Trust me, I asked one. No references needed!",
        },
        {"text": "OECD (2019). OECD Principles on AI. Paris.", "real": True, "excerpt": ""},
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
