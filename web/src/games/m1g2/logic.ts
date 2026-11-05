// m1g2 · Fact or Fib — pure mapping of v3 sentences onto the pick-the-line engine (v3 512–519).
import type { Mistake } from '../../contracts/game';
import type { PickLine } from '../../dnd/pickEngine';
import { buildMistake } from '../mistake';
import { FIB_TAG, TRUE_TAG, FOUND_PREFIX, V3_SCENARIO, type FibScenario, type Sentence } from './data';

export function toPickLine(s: Sentence): PickLine {
  return s[1] === 1 ? { text: s[0], isTarget: true, note: s[2] } : { text: s[0], isTarget: false };
}

export function pickLines(sc: FibScenario = V3_SCENARIO): PickLine[] {
  return sc.sentences.map(toPickLine);
}

/** 0-based indices of the fibs, in v3 order. */
export function fibIndices(lines: readonly PickLine[] = pickLines()): number[] {
  return lines.flatMap((l, i) => (l.isTarget === true ? [i] : []));
}

/** Bubble line when a fib is caught (tap or X-RAY): "Fib caught! <explanation>". */
export function foundLine(line: PickLine): string {
  return FOUND_PREFIX + (line.note ?? '');
}

/** Tap on a true line (mistake table): itemId `s<index>`, answer `fib`, correct `true`. */
export function trueLineMistake(line: PickLine, index: number): Mistake {
  return buildMistake('m1g2', { itemId: `s${index}`, answer: 'fib', correct: 'true', itemText: line.text, answerLabel: FIB_TAG, correctLabel: TRUE_TAG });
}
