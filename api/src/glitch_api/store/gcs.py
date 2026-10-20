"""GcsBlobStore — the blob store on a Google Cloud Storage bucket (Cloud Run).

Object name = ``<prefix>/<key>``. Generations are GCS object generations; preconditions
are GCS ``ifGenerationMatch`` (``0`` = create only if absent), so conflicting writers are
detected by the bucket itself. The ``google-cloud-storage`` client is synchronous; every
call runs in a worker thread.

Every backend failure surfaces as ``StoreError`` — not only ``GoogleAPICallError`` (HTTP
4xx/5xx) but also auth failures (``google.auth`` token refresh / missing ADC), retry
exhaustion (``RetryError``), and transport errors from ``requests`` / ``google-resumable-media``
/ sockets — so callers' fail-closed paths (durable caps, scenario cache) always run instead
of a 500. Precondition / not-found outcomes keep their own types.

The client is injectable (``client=``) — unit tests pass ``store.fake_gcs.FakeGcsClient``;
production builds ``google.cloud.storage.Client()`` from Application Default Credentials.
"""

from __future__ import annotations

import asyncio
from typing import Any

import requests
from google.api_core import exceptions as gexc
from google.auth import exceptions as gauth
from google.resumable_media import common as resumable

from glitch_api.store.base import (
    DEFAULT_CONTENT_TYPE,
    NO_OBJECT,
    AlreadyExists,
    Blob,
    PreconditionFailed,
    StoreError,
    validate_key,
    validate_prefix,
)

_GET_ATTEMPTS = 3  # object replaced between metadata read and download → re-read

# Everything the client stack can raise for "the bucket is unreachable / refused us".
# GoogleAPIError covers GoogleAPICallError (HTTP errors) and RetryError; GoogleAuthError
# covers TransportError / RefreshError / DefaultCredentialsError; RequestException covers
# requests' ConnectionError / Timeout / ChunkedEncodingError; OSError covers raw socket
# errors (ConnectionError, TimeoutError) that escape the HTTP layer.
BACKEND_ERRORS: tuple[type[BaseException], ...] = (
    gexc.GoogleAPIError,
    gauth.GoogleAuthError,
    requests.exceptions.RequestException,
    resumable.InvalidResponse,
    resumable.DataCorruption,
    OSError,
)


class GcsBlobStore:
    backend = "gcs"

    def __init__(self, bucket: str, prefix: str = "", *, client: Any | None = None) -> None:
        if not bucket:
            raise StoreError("GLITCH_GCS_BUCKET is required when GLITCH_BLOB_BACKEND=gcs")
        self.bucket_name = bucket
        self.prefix = prefix.strip("/")
        if self.prefix:
            validate_key(self.prefix)
        if client is None:
            from google.cloud import storage  # imported lazily: ADC lookup only when used

            try:
                client = storage.Client()
            except Exception as exc:  # noqa: BLE001 — credentials missing etc.
                raise StoreError(
                    f"cannot create a GCS client ({type(exc).__name__}) — check Application Default Credentials"
                ) from exc
        self.client = client
        self.bucket = client.bucket(bucket)

    def _name(self, key: str) -> str:
        validate_key(key)
        return f"{self.prefix}/{key}" if self.prefix else key

    def _key(self, name: str) -> str:
        return name[len(self.prefix) + 1 :] if self.prefix else name

    # ---- sync bodies -----------------------------------------------------------------
    def _get_sync(self, key: str) -> Blob | None:
        name = self._name(key)
        try:
            for _ in range(_GET_ATTEMPTS):
                meta = self.bucket.get_blob(name)
                if meta is None:
                    return None
                generation = int(meta.generation)
                try:
                    data = meta.download_as_bytes(if_generation_match=generation)
                except gexc.PreconditionFailed:
                    continue  # replaced mid-read
                except gexc.NotFound:
                    return None
                return Blob(key=key, data=bytes(data), generation=generation)
        except BACKEND_ERRORS as exc:
            raise StoreError(f"GCS read failed ({type(exc).__name__})") from exc
        raise StoreError("GCS read kept racing concurrent writers")

    def _put_sync(self, key: str, data: bytes, if_generation_match: int | None, content_type: str) -> int:
        name = self._name(key)
        blob = self.bucket.blob(name)
        try:
            blob.upload_from_string(data, content_type=content_type, if_generation_match=if_generation_match)
        except gexc.PreconditionFailed as exc:
            if if_generation_match == NO_OBJECT:
                raise AlreadyExists(key, NO_OBJECT) from exc
            raise PreconditionFailed(key, if_generation_match) from exc
        except gexc.NotFound as exc:  # conditional update of a missing object (some API paths)
            raise PreconditionFailed(key, if_generation_match) from exc
        except BACKEND_ERRORS as exc:
            raise StoreError(f"GCS write failed ({type(exc).__name__})") from exc
        if blob.generation is None:
            raise StoreError("GCS write returned no generation")
        return int(blob.generation)

    def _list_sync(self, prefix: str) -> list[str]:
        validate_prefix(prefix)
        full = f"{self.prefix}/{prefix}" if self.prefix else prefix
        if self.prefix and not prefix:
            full = f"{self.prefix}/"
        try:
            names = [b.name for b in self.client.list_blobs(self.bucket_name, prefix=full)]
        except BACKEND_ERRORS as exc:
            raise StoreError(f"GCS list failed ({type(exc).__name__})") from exc
        return sorted(self._key(n) for n in names if not n.endswith("/"))

    def _delete_sync(self, key: str, if_generation_match: int | None) -> bool:
        blob = self.bucket.blob(self._name(key))
        try:
            blob.delete(if_generation_match=if_generation_match)
        except gexc.NotFound:
            if if_generation_match is not None:
                raise PreconditionFailed(key, if_generation_match) from None
            return False
        except gexc.PreconditionFailed as exc:
            raise PreconditionFailed(key, if_generation_match) from exc
        except BACKEND_ERRORS as exc:
            raise StoreError(f"GCS delete failed ({type(exc).__name__})") from exc
        return True

    # ---- protocol --------------------------------------------------------------------
    async def get(self, key: str) -> Blob | None:
        return await asyncio.to_thread(self._get_sync, key)

    async def put(
        self,
        key: str,
        data: bytes,
        *,
        if_generation_match: int | None = None,
        content_type: str = DEFAULT_CONTENT_TYPE,
    ) -> int:
        return await asyncio.to_thread(self._put_sync, key, bytes(data), if_generation_match, content_type)

    async def create(self, key: str, data: bytes, *, content_type: str = DEFAULT_CONTENT_TYPE) -> int:
        return await self.put(key, data, if_generation_match=NO_OBJECT, content_type=content_type)

    async def list(self, prefix: str = "") -> list[str]:
        return await asyncio.to_thread(self._list_sync, prefix)

    async def delete(self, key: str, *, if_generation_match: int | None = None) -> bool:
        return await asyncio.to_thread(self._delete_sync, key, if_generation_match)
