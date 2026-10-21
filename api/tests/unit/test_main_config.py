"""``python -m glitch_api`` turns every settings failure into one friendly line + exit 1."""

from __future__ import annotations

import pytest

from glitch_api import __main__ as entry
from glitch_api import config as config_module

SECRET = "sk-or-v1-THIS-MUST-NEVER-BE-PRINTED"


@pytest.fixture(autouse=True)
def _no_env_file(monkeypatch: pytest.MonkeyPatch) -> None:
    """Never read the developer's repo-root .env; env vars drive each case."""
    monkeypatch.setitem(config_module.Settings.model_config, "env_file", None)


@pytest.fixture
def no_server(monkeypatch: pytest.MonkeyPatch) -> list[object]:
    started: list[object] = []
    monkeypatch.setattr(entry.uvicorn, "run", lambda app, **kw: started.append(app))
    return started


def test_bad_enum_value_prints_friendly_error_and_exits_1(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], no_server: list[object]
) -> None:
    monkeypatch.setenv("GLITCH_LLM_PROVIDER", "openruoter")
    monkeypatch.setenv("GLITCH_OPENROUTER_API_KEY", SECRET)

    assert entry.main() == 1

    err = capsys.readouterr().err
    assert err.startswith("GLITCH API config error: ")
    assert "GLITCH_LLM_PROVIDER" in err
    assert "Traceback" not in err
    assert "pydantic" not in err.lower()
    assert SECRET not in err
    assert len(err.strip().splitlines()) == 1
    assert no_server == []


def test_bad_secret_typed_field_never_echoes_input(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], no_server: list[object]
) -> None:
    # A non-int port next to a secret: the message names the field, never any input value.
    monkeypatch.setenv("GLITCH_PORT", SECRET)
    monkeypatch.setenv("GLITCH_OPENROUTER_API_KEY", SECRET)

    assert entry.main() == 1

    err = capsys.readouterr().err
    assert "GLITCH_PORT" in err
    assert SECRET not in err
    assert no_server == []


def test_startup_check_config_error_still_friendly(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], no_server: list[object]
) -> None:
    monkeypatch.setenv("GLITCH_LLM_PROVIDER", "openrouter")  # no key → ConfigError

    assert entry.main() == 1

    err = capsys.readouterr().err
    assert err.startswith("GLITCH API config error: GLITCH_LLM_PROVIDER=openrouter")
    assert no_server == []


def test_valid_config_starts_server(monkeypatch: pytest.MonkeyPatch, no_server: list[object]) -> None:
    monkeypatch.setenv("GLITCH_LLM_PROVIDER", "fake")

    assert entry.main() == 0
    assert len(no_server) == 1


def test_validator_value_error_is_generic_and_does_not_quote_input(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], no_server: list[object]
) -> None:
    # Cloud Run PORT parsing raises ValueError inside a model validator (message quotes the input).
    monkeypatch.setenv("PORT", SECRET)

    assert entry.main() == 1

    err = capsys.readouterr().err
    assert err.startswith("GLITCH API config error: ")
    assert "invalid value" in err
    assert SECRET not in err
    assert no_server == []
