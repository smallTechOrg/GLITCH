// Pure tap-the-line engine (Fact or Fib, Proxy Hunt) — v3 lines 512–519 / 550–557,
// spec/capabilities/game-runtime.md → Pick-the-line engine.

export interface PickLine {
  text: string;
  /** true = target (fib / proxy), false = safe, null = redacted (not interactive). */
  isTarget: boolean | null;
  note?: string;
  /** Redacted lines show "<label>: ▮▮▮▮▮▮ REMOVED" (v3 Proxy Hunt NAME / GENDER). */
  label?: string;
}

export type PickMark = 'target' | 'safe';

export interface PickState {
  readonly lines: readonly PickLine[];
  readonly marks: Readonly<Record<number, PickMark>>;
  readonly found: number;
}

export type TapResult = 'found' | 'safe' | 'ignored';

export const PICK_DONE_DELAY_MS = 700;

export function createPick(lines: readonly PickLine[]): PickState {
  return { lines, marks: {}, found: 0 };
}

export const targetCount = (s: PickState): number => s.lines.filter((l) => l.isTarget === true).length;
export const isMarked = (s: PickState, i: number): boolean => s.marks[i] !== undefined;
export const isComplete = (s: PickState): boolean => s.found >= targetCount(s) && targetCount(s) > 0;

function mark(s: PickState, i: number, m: PickMark): PickState {
  return { ...s, marks: { ...s.marks, [i]: m }, found: s.found + (m === 'target' ? 1 : 0) };
}

/** Tap line i: target → marked + found; non-target → marked safe (caller misses); redacted/marked → ignored. */
export function tap(s: PickState, i: number): { state: PickState; result: TapResult } {
  const l = s.lines[i];
  if (!l || l.isTarget === null || isMarked(s, i)) return { state: s, result: 'ignored' };
  return l.isTarget ? { state: mark(s, i, 'target'), result: 'found' } : { state: mark(s, i, 'safe'), result: 'safe' };
}

/** X-RAY: acts as tapping the first unmarked target. */
export function xray(s: PickState): { state: PickState; index: number | null } {
  const i = s.lines.findIndex((l, k) => l.isTarget === true && !isMarked(s, k));
  return i < 0 ? { state: s, index: null } : { state: mark(s, i, 'target'), index: i };
}

/** FOCUS: marks the first unmarked non-target safe (no heart cost). */
export function focus(s: PickState): { state: PickState; index: number | null } {
  const i = s.lines.findIndex((l, k) => l.isTarget === false && !isMarked(s, k));
  return i < 0 ? { state: s, index: null } : { state: mark(s, i, 'safe'), index: i };
}
