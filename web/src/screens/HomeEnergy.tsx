// Home's AI energy meter (durable-ai-budget.md → "Home shows the energy meter, same component
// as the free-write round"). Reads GET /v1/energy (never charges, never throws) on mount —
// Home remounts on every visit — and again whenever the app returns to the foreground.
// Unreachable server → the meter's "?" state; Home stays fully usable.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getEnergy } from '../api/client';
import { EnergyMeter, type EnergyState } from '../ui/EnergyMeter';

export function HomeEnergy({ testID = 'home-energy' }: { testID?: string }): React.JSX.Element {
  const [energy, setEnergy] = useState<EnergyState>({ kind: 'loading' });
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    pending.current?.abort();
    const ctrl = new AbortController();
    pending.current = ctrl;
    void getEnergy(ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      // An error envelope may still carry energy (e.g. cap reached) — show it.
      setEnergy(r.energy ? { kind: 'ok', ...r.energy } : { kind: 'offline' });
    });
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refresh();
    });
    return () => {
      sub.remove();
      pending.current?.abort();
    };
  }, [refresh]);

  return <EnergyMeter state={energy} testID={testID} />;
}
