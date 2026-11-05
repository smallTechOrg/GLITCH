// m4g3 · Design the Companion — pure maths (v3 lines 581–592, `calc`, `bad`, SHIP/X-RAY/FOCUS).
import type { Mistake } from '../../contracts/game';
import { buildMistake } from '../mistake';
import { ALL_MET_LABEL, FOCUS_ALL_MET, METRICS, NOT_YET_PREFIX, SHIP_ITEM_TEXT, focusLine, offTargetLabel, type Design, type MetricId, type ToggleId } from './data';

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

/**
 * SHIP IT fails (mistake table): itemId `ship`, answer = first failing metric id (v3 `bad()`
 * order, the same metric the message names), correct `all_met`. Undefined when all targets met.
 */
export function shipMistake(design: Design): Mistake | undefined {
  const c = calc(design);
  const m = METRICS.find((x) => !metricMet(x.id, c[x.id]));
  if (!m) return undefined;
  return buildMistake('m4g3', {
    itemId: 'ship',
    answer: m.id,
    correct: 'all_met',
    itemText: SHIP_ITEM_TEXT,
    answerLabel: offTargetLabel(m.label),
    correctLabel: ALL_MET_LABEL,
  });
}

/** v3 FOCUS line (always consumed). */
export function focusHint(design: Design): string {
  const first = failures(design)[0];
  return first === undefined ? FOCUS_ALL_MET : focusLine(first);
}

export const flip = (design: Design, id: ToggleId): Design => ({ ...design, [id]: design[id] ? 0 : 1 });

export const setLevel = (design: Design, key: 'e' | 'd', value: number): Design => ({ ...design, [key]: Math.max(0, Math.min(100, value)) });
