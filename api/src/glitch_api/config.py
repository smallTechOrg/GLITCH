"""Settings (prefix ``GLITCH_``) read from the repo-root ``.env`` plus real env vars.

The ``.env`` path is resolved from this file's location, never the CWD, so every runner
(``uv run`` in ``api/``, Playwright's ``cd ../api``, Docker) sees the same file.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

from fastapi import Request
from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# api/src/glitch_api/config.py → parents[3] is the repo root.
ROOT_ENV_FILE: Path = Path(__file__).resolve().parents[3] / ".env"

DEFAULT_CORS_ORIGINS = (
    "https://smalltechorg.github.io,"
    "http://127.0.0.1:8090,http://localhost:8090,"
    "http://127.0.0.1:8092,http://localhost:8092"
)

ProviderChoice = Literal["auto", "openrouter", "fake"]
ResolvedProvider = Literal["openrouter", "fake"]


class ConfigError(RuntimeError):
    """Invalid configuration detected at startup. Messages never contain secret values."""


def _split_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GLITCH_",
        env_file=ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: Literal["dev", "prod"] = "dev"
    host: str = "127.0.0.1"
    port: int = 8787
    llm_provider: ProviderChoice = "auto"
    openrouter_api_key: SecretStr | None = None
    openrouter_model: str = "google/gemini-2.5-flash-lite"
    openrouter_fallback_models: str = "openai/gpt-4o-mini"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_response_format: Literal["json_schema", "json_object"] = "json_schema"
    app_url: str = "https://smalltechorg.github.io/GLITCH/"
    llm_timeout_s: float = 7.0
    llm_max_output_tokens: int = 700
    device_daily_cap: int = 10
    global_daily_cap: int = 500
    cors_origins: str = DEFAULT_CORS_ORIGINS
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_file: str | None = None
    fake_latency_ms: int = 0

    # ---- normalisation -------------------------------------------------------------
    @field_validator("env", "llm_provider", "openrouter_response_format", "log_level", mode="before")
    @classmethod
    def _strip_enum(cls, value: Any) -> Any:
        """Drop inline ``# comments`` and whitespace that .env editors leave behind."""
        if isinstance(value, str):
            value = value.split("#", 1)[0].strip()
        return value

    @field_validator("log_level", mode="before")
    @classmethod
    def _upper_level(cls, value: Any) -> Any:
        return value.upper() if isinstance(value, str) else value

    @field_validator("openrouter_api_key", mode="before")
    @classmethod
    def _blank_key_is_none(cls, value: Any) -> Any:
        if isinstance(value, SecretStr):
            value = value.get_secret_value()
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("log_file", mode="before")
    @classmethod
    def _blank_log_file_is_none(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _cloud_run_port(self) -> Settings:
        """Cloud Run injects ``PORT``; it wins only when ``GLITCH_PORT`` is not set."""
        if "port" not in self.model_fields_set:
            cloud_port = os.environ.get("PORT", "").strip()
            if cloud_port:
                self.port = int(cloud_port)
        return self

    # ---- derived -------------------------------------------------------------------
    @property
    def has_openrouter_key(self) -> bool:
        return self.openrouter_api_key is not None and bool(self.openrouter_api_key.get_secret_value())

    @property
    def resolved_provider(self) -> ResolvedProvider:
        if self.llm_provider == "auto":
            return "openrouter" if self.has_openrouter_key else "fake"
        return self.llm_provider

    @property
    def fallback_model_list(self) -> list[str]:
        return _split_csv(self.openrouter_fallback_models)

    @property
    def cors_origin_list(self) -> list[str]:
        return _split_csv(self.cors_origins)

    def startup_check(self) -> None:
        """Raise ConfigError for configurations the server must refuse to boot with."""
        if self.llm_provider == "openrouter" and not self.has_openrouter_key:
            raise ConfigError(
                "GLITCH_LLM_PROVIDER=openrouter but GLITCH_OPENROUTER_API_KEY is missing — add it to .env"
            )
        if self.env == "prod" and self.resolved_provider == "fake":
            raise ConfigError(
                "GLITCH_ENV=prod cannot run the fake demo provider — set GLITCH_OPENROUTER_API_KEY "
                "(and GLITCH_LLM_PROVIDER=openrouter)"
            )


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    global _settings
    _settings = None


def app_settings(request: Request) -> Settings:
    """FastAPI dependency: the Settings instance the running app was created with."""
    return request.app.state.settings
