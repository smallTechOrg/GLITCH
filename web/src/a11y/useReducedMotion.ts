// Reduced motion (OS setting, read live). RN Web maps this to `prefers-reduced-motion`.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let override: boolean | null = null;
const listeners = new Set<() => void>();

/** Tests / settings can force a value; null returns control to the OS. */
export function setReducedMotionOverride(v: boolean | null): void {
  override = v;
  listeners.forEach((l) => l());
}

export function useReducedMotion(): boolean {
  const [os, setOs] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (alive) setOs(!!v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setOs(!!v));
    const l = (): void => force((n) => n + 1);
    listeners.add(l);
    return () => {
      alive = false;
      sub?.remove?.();
      listeners.delete(l);
    };
  }, []);
  return override ?? os;
}
