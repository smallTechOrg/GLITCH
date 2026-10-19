"""EnergyService + MemoryCounterStore: device/global caps, UTC days, atomicity."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from glitch_api.caps.budget import EnergyService, iso_z, next_utc_midnight, utc_day
from glitch_api.caps.store import MemoryCounterStore
from glitch_api.metrics import get_metrics

DEV = "abc123abc123"


def _service(clock, device_cap: int = 3, global_cap: int = 5) -> EnergyService:
    return EnergyService(MemoryCounterStore(), device_cap=device_cap, global_cap=global_cap, clock=clock)


def test_utc_helpers() -> None:
    now = datetime(2026, 10, 19, 23, 59, 59, tzinfo=UTC)
    assert utc_day(now) == "2026-10-19"
    assert iso_z(next_utc_midnight(now)) == "2026-10-20T00:00:00Z"


async def test_energy_starts_full_with_next_utc_midnight(frozen_clock) -> None:
    energy = await _service(frozen_clock).energy(DEV)
    assert energy.to_json() == {"remaining": 3, "limit": 3, "resetsAt": "2026-10-20T00:00:00Z"}


async def test_charge_device_decrements_and_stops_at_zero(frozen_clock) -> None:
    service = _service(frozen_clock)
    for expected in (2, 1, 0, 0):
        assert (await service.charge_device(DEV)).remaining == expected


async def test_check_reports_device_cap_and_counts_rejection(frozen_clock) -> None:
    service = _service(frozen_clock, device_cap=1)
    assert await service.check(DEV) is None
    await service.charge_device(DEV)
    assert await service.check(DEV) == "device"
    assert get_metrics().cap_rejections["device"] == 1


async def test_devices_are_independent(frozen_clock) -> None:
    service = _service(frozen_clock, device_cap=1)
    await service.charge_device(DEV)
    assert (await service.energy("other0000000")).remaining == 1


async def test_global_cap_blocks_every_device(frozen_clock) -> None:
    service = _service(frozen_clock, global_cap=2)
    assert await service.charge_global() is True
    assert await service.charge_global() is True
    assert await service.charge_global() is False
    assert await service.check("fresh0000000") == "global"
    assert get_metrics().cap_rejections["global"] == 2


async def test_utc_rollover_restores_energy_and_global_budget(frozen_clock) -> None:
    service = _service(frozen_clock, device_cap=1, global_cap=1)
    await service.charge_global()
    await service.charge_device(DEV)
    frozen_clock.set(datetime(2026, 10, 19, 23, 59, 59, tzinfo=UTC))
    assert await service.check(DEV) == "device"

    frozen_clock.advance(1)  # 2026-10-20T00:00:00Z
    energy = await service.energy(DEV)
    assert energy.remaining == 1
    assert energy.resets_at == "2026-10-21T00:00:00Z"
    assert await service.global_remaining() == 1
    assert await service.check(DEV) is None


async def test_rollover_prunes_old_day_counters(frozen_clock) -> None:
    store = MemoryCounterStore()
    service = EnergyService(store, device_cap=3, global_cap=5, clock=frozen_clock)
    await service.charge_device(DEV)
    await service.charge_global()
    assert len(store) == 2
    frozen_clock.advance(24 * 3600)
    await service.energy(DEV)
    assert len(store) == 0


async def test_concurrent_global_charges_never_exceed_cap(frozen_clock) -> None:
    service = _service(frozen_clock, global_cap=10)
    results = await asyncio.gather(*(service.charge_global() for _ in range(50)))
    assert sum(results) == 10
    assert await service.global_remaining() == 0


async def test_reserve_device_is_atomic_under_concurrency(frozen_clock) -> None:
    service = _service(frozen_clock, device_cap=1)
    results = await asyncio.gather(*(service.reserve_device(DEV) for _ in range(20)))
    assert sum(r is not None for r in results) == 1
    assert (await service.energy(DEV)).remaining == 0


async def test_refund_device_returns_reserved_energy_and_never_goes_negative(frozen_clock) -> None:
    service = _service(frozen_clock, device_cap=2)
    day = await service.reserve_device(DEV)
    assert day == "2026-10-19"
    assert (await service.energy(DEV)).remaining == 1
    await service.refund_device(DEV, day)
    assert (await service.energy(DEV)).remaining == 2
    await service.refund_device(DEV, day)  # extra refund: floor at zero used
    assert (await service.energy(DEV)).remaining == 2


async def test_refund_for_a_past_day_does_not_touch_today(frozen_clock) -> None:
    service = _service(frozen_clock, device_cap=1)
    day = await service.reserve_device(DEV)
    frozen_clock.advance(24 * 3600)
    assert await service.reserve_device(DEV) == "2026-10-20"
    await service.refund_device(DEV, day)
    assert (await service.energy(DEV)).remaining == 0


async def test_store_decr_floors_at_zero() -> None:
    store = MemoryCounterStore()
    await store.incr_if_below("k:1", 5)
    assert await store.decr("k:1") == 0
    assert await store.decr("k:1") == 0
    assert await store.decr("missing:1") == 0
    assert len(store) == 0
