"""m1g1 · Train the Model — 6 training emails + 4 test emails, model wrong on exactly 2.

Served ``data``::

    {"trainEmails": [{"id": "e1", "text": "...", "label": "spam" | "not_spam"}] × 6,
     "testEmails":  [{"id": "t1", "text": "...", "label": "spam" | "not_spam",
                      "modelSays": "SPAM" | "NOT SPAM", "modelRight": bool}] × 4}

v3 mapping: TrainEmail = [id, text, label == "spam" ? "s" : "n"];
TestEmail = [id, text, modelSays, modelRight ? "r" : "w"]. ``modelRight`` is derived
server-side (``modelSays`` agrees with the true ``label``), never taken from the model.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from glitch_api.scenarios.schemas.base import STRING, GameSpec, Strict, arr, duplicates, enum, obj

TEXT_MIN, TEXT_MAX = 3, 60
TRAIN_COUNT, TEST_COUNT = 6, 4
TRAIN_SPAM = 3
TEST_SPAM = 2
TEST_WRONG = 2

Label = Literal["spam", "not_spam"]
Says = Literal["SPAM", "NOT SPAM"]


class LLMTrainEmail(Strict):
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    label: Label


class LLMTestEmail(Strict):
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    label: Label
    model_says: Says = Field(alias="modelSays")


class LLMOutput(Strict):
    train_emails: list[LLMTrainEmail] = Field(alias="trainEmails", max_length=20)
    test_emails: list[LLMTestEmail] = Field(alias="testEmails", max_length=20)


class TrainEmail(Strict):
    id: str = Field(pattern=r"^e[1-6]$")
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    label: Label


class TestEmail(Strict):
    id: str = Field(pattern=r"^t[1-4]$")
    text: str = Field(min_length=TEXT_MIN, max_length=TEXT_MAX)
    label: Label
    model_says: Says = Field(alias="modelSays")
    model_right: bool = Field(alias="modelRight")


class Data(Strict):
    train_emails: list[TrainEmail] = Field(alias="trainEmails")
    test_emails: list[TestEmail] = Field(alias="testEmails")


LLM_JSON_SCHEMA = obj(
    {
        "trainEmails": arr(obj({"text": STRING, "label": enum("spam", "not_spam")})),
        "testEmails": arr(obj({"text": STRING, "label": enum("spam", "not_spam"), "modelSays": enum("SPAM", "NOT SPAM")})),
    }
)
# modelRight is derived server-side, never asked of the model.


def to_data(out: LLMOutput) -> dict[str, Any]:
    return {
        "trainEmails": [{"id": f"e{i}", "text": e.text, "label": e.label} for i, e in enumerate(out.train_emails, 1)],
        "testEmails": [
            {
                "id": f"t{i}",
                "text": e.text,
                "label": e.label,
                "modelSays": e.model_says,
                "modelRight": (e.model_says == "SPAM") == (e.label == "spam"),
            }
            for i, e in enumerate(out.test_emails, 1)
        ],
    }


def domain_errors(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    train, test = data["trainEmails"], data["testEmails"]
    if len(train) != TRAIN_COUNT:
        errors.append(f"trainEmails must have exactly {TRAIN_COUNT} emails (got {len(train)})")
    if len(test) != TEST_COUNT:
        errors.append(f"testEmails must have exactly {TEST_COUNT} emails (got {len(test)})")
    spam_train = sum(e["label"] == "spam" for e in train)
    if len(train) == TRAIN_COUNT and spam_train != TRAIN_SPAM:
        errors.append(f"trainEmails must be {TRAIN_SPAM} spam + {TRAIN_COUNT - TRAIN_SPAM} not_spam (got {spam_train} spam)")
    spam_test = sum(e["label"] == "spam" for e in test)
    if len(test) == TEST_COUNT and spam_test != TEST_SPAM:
        errors.append(f"testEmails must be {TEST_SPAM} spam + {TEST_COUNT - TEST_SPAM} not_spam (got {spam_test} spam)")
    wrong = sum(not e["modelRight"] for e in test)
    if len(test) == TEST_COUNT and wrong != TEST_WRONG:
        errors.append(
            f"the model must be WRONG on exactly {TEST_WRONG} test emails, i.e. modelSays disagrees with label "
            f"(got {wrong})"
        )
    for e in test:
        if e["modelRight"] != ((e["modelSays"] == "SPAM") == (e["label"] == "spam")):
            errors.append(f"{e['id']}: modelRight inconsistent with modelSays/label")
    dups = duplicates(e["text"] for e in [*train, *test])
    if dups:
        errors.append(f"every email must be different (repeated: {dups[0]!r})")
    return errors


def texts(data: dict[str, Any]) -> list[str]:
    return [e["text"] for e in [*data["trainEmails"], *data["testEmails"]]]


V3_LLM: dict[str, Any] = {
    "trainEmails": [
        {"text": "WIN a FREE prize!!! Click now", "label": "spam"},
        {"text": "Lunch at 1? I'm outside", "label": "not_spam"},
        {"text": "Account locked. Verify your password here", "label": "spam"},
        {"text": "Maths homework due Friday", "label": "not_spam"},
        {"text": "Cheap watches 90% off. Buy now", "label": "spam"},
        {"text": "Mum: dinner is ready", "label": "not_spam"},
    ],
    "testEmails": [
        {"text": "Meeting moved to 3pm", "label": "not_spam", "modelSays": "SPAM"},
        {"text": "FREE pizza voucher, click", "label": "spam", "modelSays": "SPAM"},
        {"text": "Photos from the trip", "label": "not_spam", "modelSays": "NOT SPAM"},
        {"text": "Exam result: verify password", "label": "spam", "modelSays": "NOT SPAM"},
    ],
}

SPEC = GameSpec(
    game_id="m1g1",
    title="Train the Model",
    llm_model=LLMOutput,
    llm_json_schema=LLM_JSON_SCHEMA,
    data_model=Data,
    to_data=to_data,
    domain_errors=domain_errors,
    texts=texts,
    v3_llm=V3_LLM,
)
