// m1g2 · Fact or Fib — pure mapping of v3 sentences onto the pick-the-line engine (v3 512–519).
import type { PickLine } from '../../dnd/pickEngine';
import { FOUND_PREFIX, SENTENCES, type Sentence } from './data';

export function toPickLine(s: Sentence): PickLine {
  return s[1] === 1 ? { text: s[0], isTarget: true, note: s[2] } : { text: s[0], isTarget: false };
}

export function pickLines(): PickLine[] {
  return SENTENCES.map(toPickLine);
}

/** 0-based indices of the fibs, in v3 order. */
export function fibIndices(lines: readonly PickLine[] = pickLines()): number[] {
  return lines.flatMap((l, i) => (l.isTarget === true ? [i] : []));
}

/** Bubble line when a fib is caught (tap or X-RAY): "Fib caught! <explanation>". */
export function foundLine(line: PickLine): string {
  return FOUND_PREFIX + (line.note ?? '');
}
