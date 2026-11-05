"""Scenario variations (Phase 2): per-game schemas + validators, the generate-once pipeline
and the blob-store cache. Entry points:

- ``pipeline.run_scenario(...)`` — live ``next`` requests and the bank script.
- ``repository.ScenarioRepository`` — cache reads/writes on any ``BlobStore``.
- ``schemas.GAMES`` / ``parse_candidate`` / ``validate_data`` — the contract per game.
"""

from __future__ import annotations

from typing import Any

from glitch_api.llm.base import LLMProvider
from glitch_api.scenarios.repository import DEMO_NAMESPACE, NAMESPACE, ScenarioRepository
from glitch_api.store import store_for


def namespace_for(provider: LLMProvider) -> str:
    """Demo-provider case files live apart so they are never served by the real AI."""
    return DEMO_NAMESPACE if provider.name == "fake" else NAMESPACE


def repository_for(app: Any, provider: LLMProvider) -> ScenarioRepository:
    return ScenarioRepository(store_for(app), namespace_for(provider))
