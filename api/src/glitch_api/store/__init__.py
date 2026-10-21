"""Blob store: protocol (``base``), local directory (``local``), GCS bucket (``gcs``).

``build_store(settings)`` picks the backend from ``GLITCH_BLOB_BACKEND``; ``store_for(app)``
keeps one store per app instance (tests pre-set ``app.state.blob_store``).
"""

from __future__ import annotations

from typing import Any

from glitch_api.config import Settings
from glitch_api.store.base import (
    NO_OBJECT,
    AlreadyExists,
    Blob,
    BlobStore,
    ConflictRetriesExhausted,
    InvalidKey,
    PreconditionFailed,
    StoreError,
    create_json,
    dumps,
    get_json,
    put_json,
    update_json,
)
from glitch_api.store.local import LocalBlobStore

__all__ = [
    "NO_OBJECT",
    "AlreadyExists",
    "Blob",
    "BlobStore",
    "ConflictRetriesExhausted",
    "InvalidKey",
    "LocalBlobStore",
    "PreconditionFailed",
    "StoreError",
    "build_store",
    "create_json",
    "dumps",
    "get_json",
    "put_json",
    "store_for",
    "update_json",
]


def build_store(settings: Settings, *, gcs_client: Any | None = None) -> BlobStore:
    if settings.blob_backend == "gcs":
        from glitch_api.store.gcs import GcsBlobStore

        return GcsBlobStore(settings.gcs_bucket or "", settings.blob_prefix, client=gcs_client)
    return LocalBlobStore(settings.cache_path, settings.blob_prefix)


def store_for(app: Any) -> BlobStore:
    store = getattr(app.state, "blob_store", None)
    if store is None:
        store = build_store(app.state.settings)
        app.state.blob_store = store
    return store
