"""In-memory stand-in for the slice of ``google.cloud.storage.Client`` that ``GcsBlobStore`` uses.

Test double only (never selected by configuration). It reproduces the GCS behaviours the
adapter depends on: per-object generations that grow on every write, ``ifGenerationMatch``
(``0`` = must not exist) raising ``google.api_core.exceptions.PreconditionFailed`` (HTTP
412), ``NotFound`` (404) for missing objects, prefix listing, and an optional
``on_upload`` hook so tests can inject a concurrent writer between a read and a write.
"""

from __future__ import annotations

import itertools
import threading
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

from google.api_core import exceptions as gexc


@dataclass
class _Obj:
    data: bytes
    generation: int
    content_type: str


class FakeGcsClient:
    def __init__(self) -> None:
        self.buckets: dict[str, dict[str, _Obj]] = {}
        self._gen = itertools.count(1_700_000_000_000_000)
        self._lock = threading.Lock()
        self.on_upload: Callable[[str, str], None] | None = None  # (bucket, name) before each upload
        self.calls: list[tuple[str, str]] = []  # (operation, object name)
        self.fail_next: Exception | None = None  # raised by the next client call (any error type)

    def bucket(self, name: str) -> FakeBucket:
        self.buckets.setdefault(name, {})
        return FakeBucket(self, name)

    def list_blobs(self, bucket_or_name: Any, prefix: str | None = None, **_: Any) -> Iterator[FakeBlob]:
        name = bucket_or_name if isinstance(bucket_or_name, str) else bucket_or_name.name
        self._maybe_fail("list", prefix or "")
        with self._lock:
            objects = dict(self.buckets.get(name, {}))
        for obj_name in sorted(objects):
            if prefix is None or obj_name.startswith(prefix):
                blob = FakeBlob(self, name, obj_name)
                blob.generation = objects[obj_name].generation
                yield blob

    def _next_generation(self) -> int:
        return next(self._gen)

    def _maybe_fail(self, op: str, name: str) -> None:
        self.calls.append((op, name))
        if self.fail_next is not None:
            exc, self.fail_next = self.fail_next, None
            raise exc


class FakeBucket:
    def __init__(self, client: FakeGcsClient, name: str) -> None:
        self.client = client
        self.name = name

    def blob(self, name: str) -> FakeBlob:
        return FakeBlob(self.client, self.name, name)

    def get_blob(self, name: str, **_: Any) -> FakeBlob | None:
        self.client._maybe_fail("get_blob", name)
        with self.client._lock:
            obj = self.client.buckets[self.name].get(name)
        if obj is None:
            return None
        blob = FakeBlob(self.client, self.name, name)
        blob.generation = obj.generation
        return blob


class FakeBlob:
    def __init__(self, client: FakeGcsClient, bucket: str, name: str) -> None:
        self.client = client
        self.bucket_name = bucket
        self.name = name
        self.generation: int | None = None

    def _objects(self) -> dict[str, _Obj]:
        return self.client.buckets[self.bucket_name]

    @staticmethod
    def _check(current: _Obj | None, if_generation_match: int | None) -> None:
        if if_generation_match is None:
            return
        if if_generation_match == 0:
            if current is not None:
                raise gexc.PreconditionFailed("At least one of the pre-conditions you specified did not hold.")
            return
        if current is None or current.generation != if_generation_match:
            raise gexc.PreconditionFailed("At least one of the pre-conditions you specified did not hold.")

    def upload_from_string(
        self, data: bytes | str, content_type: str = "text/plain", if_generation_match: int | None = None, **_: Any
    ) -> None:
        if self.client.on_upload is not None:
            self.client.on_upload(self.bucket_name, self.name)
        self.client._maybe_fail("upload", self.name)
        payload = data.encode("utf-8") if isinstance(data, str) else bytes(data)
        with self.client._lock:
            objects = self._objects()
            self._check(objects.get(self.name), if_generation_match)
            generation = self.client._next_generation()
            objects[self.name] = _Obj(payload, generation, content_type)
        self.generation = generation

    def download_as_bytes(self, if_generation_match: int | None = None, **_: Any) -> bytes:
        self.client._maybe_fail("download", self.name)
        with self.client._lock:
            obj = self._objects().get(self.name)
            if obj is None:
                raise gexc.NotFound("No such object")
            self._check(obj, if_generation_match)
            self.generation = obj.generation
            return obj.data

    def delete(self, if_generation_match: int | None = None, **_: Any) -> None:
        self.client._maybe_fail("delete", self.name)
        with self.client._lock:
            objects = self._objects()
            obj = objects.get(self.name)
            if obj is None:
                raise gexc.NotFound("No such object")
            self._check(obj, if_generation_match)
            del objects[self.name]
