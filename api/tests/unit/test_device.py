import hashlib

import pytest

from glitch_api.device import device_hash, parse_device_id
from glitch_api.envelope import ApiError

VALID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c"


def test_parse_device_id_accepts_uuid_v4_and_normalises_case() -> None:
    assert parse_device_id(VALID.upper()) == VALID


@pytest.mark.parametrize(
    "value",
    [None, "", "not-a-uuid", "3f2b8c1e-9a4d-1e7b-8c2a-1d5e6f7a8b9c",  # version 1
     "3f2b8c1e9a4d4e7b8c2a1d5e6f7a8b9c",  # no hyphens
     "3f2b8c1e-9a4d-4e7b-cc2a-1d5e6f7a8b9c"],  # bad variant
)
def test_parse_device_id_rejects_missing_or_non_v4(value) -> None:
    with pytest.raises(ApiError) as exc:
        parse_device_id(value)
    assert exc.value.code == "BAD_DEVICE"
    assert exc.value.http_status == 400


def test_device_hash_is_sha256_prefix_and_not_the_raw_id() -> None:
    h = device_hash(VALID)

    assert h == hashlib.sha256(VALID.encode()).hexdigest()[:12]
    assert VALID not in h
