// m4g3 · Design the Companion — pure maths (v3 lines 581–592, `calc`, `bad`, SHIP/X-RAY/FOCUS).
import { FOCUS_ALL_MET, METRICS, NOT_YET_PREFIX, focusLine, type Design, type MetricId, type ToggleId } from './data';

export type Metrics = Record<MetricId, number>;

/** v3 `calc()` — identical operation order, unrounded. */
export function calc({ e, d, R, H, A }: Design): Metrics {
  return {
    time: 20 + 0.7 * e,
    well: 95 - 0.9 * e + 12 * R + 6 * A,
    fr: 90 - 0.9 * e + 15 * R,
    pv: 10 + 0.8 * d - 15 * H,
    help: 40 + 0.4 * d + 0.2 * e,
  };
}

/** v3 metric(): ok = dir>0 ? v ≥ tg : v ≤ tg. */
export function metricMet(id: MetricId, value: number): boolean {
  const m = METRICS.find((x) => x.id === id);
  if (!m) return false;
  return m.dir > 0 ? value >= m.target : value <= m.target;
}

/** v3 `bad()`: failure phrases in fixed order. */
export function failures(design: Design): string[] {
  const c = calc(design);
  return METRICS.filter((m) => !metricMet(m.id, c[m.id])).map((m) => m.failure);
}

export type ShipResult = { ok: true } | { ok: false; message: string };

/** v3 SHIP IT: all met → ok; else miss("Not yet: " + first failure + "."). */
export function ship(design: Design): ShipResult {
  const b = failures(design);
  const first = b[0];
  return first === undefined ? { ok: true } : { ok: false, message: `${NOT_YET_PREFIX}${first}.` };
}

/** v3 FOCUS line (always consumed). */
export function focusHint(design: Design): string {
  const first = failures(design)[0];
  return first === undefined ? FOCUS_ALL_MET : focusLine(first);
}

export const flip = (design: Design, id: ToggleId): Design => ({ ...design, [id]: design[id] ? 0 : 1 });

export const setLevel = (design: Design, key: 'e' | 'd', value: number): Design => ({ ...design, [key]: Math.max(0, Math.min(100, value)) });
