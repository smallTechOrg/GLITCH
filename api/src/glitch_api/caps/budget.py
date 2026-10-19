"""EnergyService — device energy (10 / UTC day) and the global ceiling (500 / UTC day).

- Device energy is RESERVED atomically before the provider call (``reserve_device``) so a
  burst of concurrent requests cannot overspend it, and REFUNDED (``refund_device``) on every
  path that is not a successful AI evaluation — net effect: only successes use energy.
- The global budget is charged before every provider call (``charge_global``), so failed
  calls still count toward spend.
- Days are UTC calendar days; ``resetsAt`` is the next UTC midnight.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from glitch_api.caps.clock import Clock, SystemClock
from glitch_api.caps.store import CounterStore, MemoryCounterStore
from glitch_api.envelope import Energy
from glitch_api.logging import get_logger
from glitch_api.metrics import get_metrics

CapScope = Literal["device", "global"]


def utc_day(now: datetime) -> str:
    return now.astimezone(UTC).strftime("%Y-%m-%d")


def next_utc_midnight(now: datetime) -> datetime:
    day = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return day + timedelta(days=1)


def iso_z(when: datetime) -> str:
    return when.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class EnergyService:
    def __init__(
        self,
        store: CounterStore,
        *,
        device_cap: int,
        global_cap: int,
        clock: Clock | None = None,
    ) -> None:
        self.store = store
        self.device_cap = device_cap
        self.global_cap = global_cap
        self.clock = clock or SystemClock()
        self._last_day: str | None = None

    # ---- keys ----------------------------------------------------------------------
    def _day(self) -> str:
        return utc_day(self.clock.now())

    async def _roll(self, day: str) -> None:
        if self._last_day != day:
            await self.store.prune(keep_suffix=f":{day}")
            self._last_day = day

    @staticmethod
    def _device_key(device_hash: str, day: str) -> str:
        return f"device:{device_hash}:{day}"

    @staticmethod
    def _global_key(day: str) -> str:
        return f"global:{day}"

    # ---- reads ---------------------------------------------------------------------
    async def energy(self, device_hash: str) -> Energy:
        now = self.clock.now()
        day = utc_day(now)
        await self._roll(day)
        used = await self.store.get(self._device_key(device_hash, day))
        return Energy(
            remaining=max(0, self.device_cap - used),
            limit=self.device_cap,
            resetsAt=iso_z(next_utc_midnight(now)),
        )

    async def global_remaining(self) -> int:
        day = self._day()
        await self._roll(day)
        return max(0, self.global_cap - await self.store.get(self._global_key(day)))

    async def check(self, device_hash: str) -> CapScope | None:
        """None when a call may proceed, else the exhausted scope (logged + counted)."""
        energy = await self.energy(device_hash)
        if energy.remaining <= 0:
            self._reject("device", 0, self.device_cap)
            return "device"
        remaining = await self.global_remaining()
        if remaining <= 0:
            self._reject("global", 0, self.global_cap)
            return "global"
        return None

    # ---- writes --------------------------------------------------------------------
    async def reserve_device(self, device_hash: str) -> str | None:
        """Atomically take one unit of device energy for an in-flight evaluation.

        Returns the UTC day the unit was taken from (pass it to ``refund_device``), or None
        when the device is out of energy (rejection logged + counted).
        """
        day = self._day()
        await self._roll(day)
        reserved, _ = await self.store.incr_if_below(self._device_key(device_hash, day), self.device_cap)
        if not reserved:
            self._reject("device", 0, self.device_cap)
            return None
        return day

    async def refund_device(self, device_hash: str, day: str) -> None:
        """Give back a reservation. A reservation from an already-pruned day is a no-op."""
        if day != self._day():
            return
        await self.store.decr(self._device_key(device_hash, day))

    async def ensure_global(self) -> bool:
        """False (rejection logged + counted) when today's global ceiling is spent."""
        if await self.global_remaining() <= 0:
            self._reject("global", 0, self.global_cap)
            return False
        return True

    async def charge_global(self) -> bool:
        """Count one provider call. False when the ceiling was reached concurrently."""
        day = self._day()
        await self._roll(day)
        charged, value = await self.store.incr_if_below(self._global_key(day), self.global_cap)
        if not charged:
            self._reject("global", 0, self.global_cap)
        return charged

    async def charge_device(self, device_hash: str) -> Energy:
        """Unconditionally use one unit (no reservation). Kept for tests/tools."""
        day = self._day()
        await self._roll(day)
        await self.store.incr_if_below(self._device_key(device_hash, day), self.device_cap)
        return await self.energy(device_hash)

    @staticmethod
    def _reject(scope: CapScope, remaining: int, limit: int) -> None:
        get_metrics().record_cap_rejection(scope)
        get_logger().warning("cap", scope=scope, remaining=remaining, limit=limit)


def energy_service_for(app: Any) -> EnergyService:
    """The app's EnergyService, created on first use from ``app.state.settings``.

    Tests may pre-set ``app.state.clock`` (frozen clock) or ``app.state.energy``.
    """
    state = app.state
    service = getattr(state, "energy", None)
    if service is None:
        settings = state.settings
        service = EnergyService(
            MemoryCounterStore(),
            device_cap=settings.device_daily_cap,
            global_cap=settings.global_daily_cap,
            clock=getattr(state, "clock", None) or SystemClock(),
        )
        state.energy = service
    return service
