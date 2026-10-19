from pathlib import Path

import pytest

from glitch_api import config as config_module
from glitch_api.config import ConfigError, Settings


def test_settings_env_file_resolves_to_repo_root_regardless_of_cwd(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    repo_root = Path(__file__).resolve().parents[3]

    assert config_module.ROOT_ENV_FILE == repo_root / ".env"
    assert Settings.model_config["env_file"] == config_module.ROOT_ENV_FILE


def test_settings_defaults_match_architecture(make_settings) -> None:
    s = make_settings()

    assert s.env == "dev"
    assert s.host == "127.0.0.1"
    assert s.port == 8787
    assert s.llm_provider == "auto"
    assert s.openrouter_model == "google/gemini-2.5-flash-lite"
    assert s.fallback_model_list == ["openai/gpt-4o-mini"]
    assert s.openrouter_base_url == "https://openrouter.ai/api/v1"
    assert s.openrouter_response_format == "json_schema"
    assert s.app_url == "https://smalltechorg.github.io/GLITCH/"
    assert s.llm_timeout_s == 7.0
    assert s.llm_max_output_tokens == 700
    assert s.device_daily_cap == 10
    assert s.global_daily_cap == 500
    assert s.log_level == "INFO"
    assert s.log_file is None
    assert s.fake_latency_ms == 0
    assert set(s.cors_origin_list) == {
        "https://smalltechorg.github.io",
        "http://127.0.0.1:8090",
        "http://localhost:8090",
        "http://127.0.0.1:8092",
        "http://localhost:8092",
    }


def test_settings_reads_values_from_an_env_file(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("GLITCH_OPENROUTER_MODEL=vendor/x\nGLITCH_DEVICE_DAILY_CAP=3\n")

    s = Settings(_env_file=env)

    assert s.openrouter_model == "vendor/x"
    assert s.device_daily_cap == 3


def test_settings_key_is_secret_and_never_in_repr(make_settings) -> None:
    secret = "sk-or-v1-DO-NOT-LEAK-0123456789"
    s = make_settings(openrouter_api_key=secret)

    assert s.has_openrouter_key is True
    assert s.openrouter_api_key is not None
    assert s.openrouter_api_key.get_secret_value() == secret
    assert secret not in repr(s)
    assert secret not in str(s)
    assert secret not in s.model_dump_json()


def test_settings_blank_key_counts_as_missing(make_settings) -> None:
    s = make_settings(openrouter_api_key="   ")

    assert s.has_openrouter_key is False
    assert s.resolved_provider == "fake"


def test_settings_auto_provider_resolves_by_key_presence(make_settings) -> None:
    assert make_settings().resolved_provider == "fake"
    assert make_settings(openrouter_api_key="k").resolved_provider == "openrouter"
    assert make_settings(llm_provider="fake", openrouter_api_key="k").resolved_provider == "fake"


def test_settings_strips_inline_comments_from_enum_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GLITCH_LLM_PROVIDER", "fake   # demo mode")
    monkeypatch.setenv("GLITCH_ENV", " dev#local")
    monkeypatch.setenv("GLITCH_OPENROUTER_RESPONSE_FORMAT", "json_object # no schema support")

    s = Settings(_env_file=None)

    assert s.llm_provider == "fake"
    assert s.env == "dev"
    assert s.openrouter_response_format == "json_object"


def test_settings_rejects_unknown_provider(make_settings) -> None:
    with pytest.raises(ValueError):
        make_settings(llm_provider="gpt")


def test_settings_cloud_run_port_wins_when_glitch_port_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PORT", "8080")
    assert Settings(_env_file=None).port == 8080

    monkeypatch.setenv("GLITCH_PORT", "9999")
    assert Settings(_env_file=None).port == 9999


def test_settings_empty_fallback_models_means_none(make_settings) -> None:
    assert make_settings(openrouter_fallback_models="").fallback_model_list == []
    assert make_settings(openrouter_fallback_models=" a/b , c/d ,").fallback_model_list == ["a/b", "c/d"]


def test_startup_check_rejects_openrouter_without_key(make_settings) -> None:
    with pytest.raises(ConfigError, match="GLITCH_OPENROUTER_API_KEY"):
        make_settings(llm_provider="openrouter").startup_check()


def test_startup_check_rejects_fake_provider_in_prod(make_settings) -> None:
    with pytest.raises(ConfigError, match="prod"):
        make_settings(env="prod").startup_check()


def test_startup_check_accepts_prod_with_key(make_settings) -> None:
    make_settings(env="prod", openrouter_api_key="k").startup_check()


def test_get_settings_is_a_resettable_singleton() -> None:
    from glitch_api.config import get_settings, reset_settings

    first = get_settings()
    assert get_settings() is first
    reset_settings()
    assert get_settings() is not first


def test_env_example_documents_every_setting_and_loads_cleanly() -> None:
    example = Path(__file__).resolve().parents[3] / ".env.example"
    text = example.read_text()
    keys = {line.split("=", 1)[0] for line in text.splitlines() if "=" in line and not line.startswith("#")}

    for field in Settings.model_fields:
        assert f"GLITCH_{field.upper()}" in keys, field
    for web_var in ("EXPO_PUBLIC_GLITCH_API_URL", "GLITCH_WEB_PORT", "GLITCH_E2E_EXPECT_PROVIDER"):
        assert web_var in keys
    for phase2 in ("GLITCH_BLOB_BACKEND", "GLITCH_CACHE_DIR", "GLITCH_GCS_BUCKET"):
        assert phase2 in keys

    s = Settings(_env_file=example)
    assert s.has_openrouter_key is False
    assert s.resolved_provider == "fake"
    assert s.log_file is None
    assert s.port == 8787
