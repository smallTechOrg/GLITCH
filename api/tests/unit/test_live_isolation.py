"""The live tier's Settings never point the blob store at the repo's api/.cache (QA M1)."""

from __future__ import annotations

from pathlib import Path

import pytest

from glitch_api.config import REPO_ROOT
from tests.live.conftest import live_settings


def test_live_settings_force_a_tmp_local_blob_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Even when the environment asks for the repo cache / a bucket / prod, live apps stay isolated.
    monkeypatch.setenv("GLITCH_BLOB_BACKEND", "gcs")
    monkeypatch.setenv("GLITCH_GCS_BUCKET", "real-bucket")
    monkeypatch.setenv("GLITCH_CACHE_DIR", "api/.cache")
    monkeypatch.setenv("GLITCH_BLOB_PREFIX", "prod")
    monkeypatch.setenv("GLITCH_ENV", "prod")

    s = live_settings(tmp_path, _env_file=None)

    assert s.blob_backend == "local" and s.gcs_bucket is None and s.blob_prefix == "" and s.env == "dev"
    assert s.cache_path == tmp_path / "cache"
    assert REPO_ROOT / "api" / ".cache" not in (s.cache_path, *s.cache_path.parents)


def test_live_settings_overrides_still_apply(tmp_path: Path) -> None:
    s = live_settings(tmp_path, _env_file=None, log_file=str(tmp_path / "x.log"))
    assert s.log_file == str(tmp_path / "x.log")
