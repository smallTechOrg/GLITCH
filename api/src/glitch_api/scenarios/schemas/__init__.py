"""Per-game scenario schemas + validators (``SCHEMA_VERSION`` 1). See ``spec/api.md``.

``GAMES`` maps each content game id to its ``GameSpec``. ``parse_candidate`` and
``validate_data`` are the schema + domain validation steps shared by live generation,
the bank script and cache reads.
"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from glitch_api.scenarios.schemas import m1g1, m1g2, m3g1, m4g1, m4g2
from glitch_api.scenarios.schemas.base import SCHEMA_VERSION, GameSpec

GAMES: dict[str, GameSpec] = {spec.game_id: spec for spec in (m1g1.SPEC, m1g2.SPEC, m3g1.SPEC, m4g1.SPEC, m4g2.SPEC)}
GAME_IDS: tuple[str, ...] = tuple(GAMES)

MAX_ERRORS = 8


class ScenarioInvalid(ValueError):
    """Schema or domain validation failed. ``errors`` are fixed, model-facing strings."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors[:MAX_ERRORS]


def _schema_errors(exc: ValidationError) -> list[str]:
    out: list[str] = []
    for err in exc.errors()[:MAX_ERRORS]:
        loc = ".".join(str(p) for p in err.get("loc", ())) or "(root)"
        out.append(f"{loc}: {err.get('msg', 'invalid')}")
    return out


def parse_candidate(game_id: str, obj: Any) -> dict[str, Any]:
    """LLM JSON object → validated ``data`` (schema → normalise → domain). Raises ScenarioInvalid."""
    spec = GAMES[game_id]
    if not isinstance(obj, dict):
        raise ScenarioInvalid(["output must be a JSON object"])
    try:
        out = spec.llm_model.model_validate(obj)
    except ValidationError as exc:
        raise ScenarioInvalid(_schema_errors(exc)) from None
    data = spec.to_data(out)
    return validate_data(game_id, data)


def validate_data(game_id: str, data: Any) -> dict[str, Any]:
    """Validate a served/stored ``data`` object (schema + domain). Returns the canonical dict."""
    spec = GAMES[game_id]
    try:
        model = spec.data_model.model_validate(data)
    except ValidationError as exc:
        raise ScenarioInvalid(_schema_errors(exc)) from None
    canonical = model.model_dump(by_alias=True, mode="json")
    errors = spec.domain_errors(canonical)
    if errors:
        raise ScenarioInvalid(errors)
    return canonical


__all__ = ["GAMES", "GAME_IDS", "SCHEMA_VERSION", "GameSpec", "ScenarioInvalid", "parse_candidate", "validate_data"]
