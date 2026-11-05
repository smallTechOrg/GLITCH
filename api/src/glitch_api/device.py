"""Anonymous device id: parse ``X-Glitch-Device`` (UUID v4) and hash it for logs/counters.

The raw id is never logged; only ``device_hash()`` (sha256 hex, first 12 chars) is.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from fastapi import Header

from glitch_api.envelope import ApiError

DEVICE_HEADER = "X-Glitch-Device"

_UUID_V4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def parse_device_id(value: str | None) -> str:
    """Return the canonical lower-case UUID v4, or raise ``ApiError("BAD_DEVICE")``."""
    candidate = (value or "").strip().lower()
    if not _UUID_V4.match(candidate):
        raise ApiError("BAD_DEVICE")
    return candidate


def device_hash(device_id: str) -> str:
    return hashlib.sha256(device_id.encode("utf-8")).hexdigest()[:12]


def try_device_hash(value: str | None) -> str | None:
    """Hash of a valid header value, else None (used by the request logger)."""
    try:
        return device_hash(parse_device_id(value))
    except ApiError:
        return None


@dataclass(frozen=True)
class Device:
    id: str
    hash: str


async def require_device(x_glitch_device: str | None = Header(default=None, alias=DEVICE_HEADER)) -> Device:
    """FastAPI dependency: ``device: Device = Depends(require_device)``."""
    device_id = parse_device_id(x_glitch_device)
    return Device(id=device_id, hash=device_hash(device_id))
