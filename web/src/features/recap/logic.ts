// End-of-game recap — pure rules (mistake-recap.md). Zero tokens, no network: rows are built
// from this run's SessionMistakes plus any explanation already fetched this run.
import { mistakeKey, type SessionMistake } from '../../contracts/game';
import type { Explanation } from '../tutor/AskNovaWhy';

/** At most this many rows; the rest collapse into "+n more". */
export const RECAP_MAX_ROWS = 5;

export interface RecapRow {
  key: string; // mistakeKey (itemId|answer)
  itemText: string;
  answerLabel: string;
  correctLabel: string;
  /** The fetched explanation text for this key, else the canned miss message (first occurrence). */
  why: string;
  /** True when any occurrence of this key was absorbed by the shield. */
  shielded: boolean;
  /** Occurrences of this key in the run (×n shown when > 1). */
  count: number;
}

export interface Recap {
  rows: RecapRow[];
  /** Distinct mistakes beyond RECAP_MAX_ROWS. */
  more: number;
}

/** Dedupe by mistakeKey in first-occurrence order; cap at `max` rows. */
export function buildRecap(
  mistakes: readonly SessionMistake[],
  explanations: Readonly<Record<string, Explanation>>,
  max: number = RECAP_MAX_ROWS,
): Recap {
  const order: RecapRow[] = [];
  const by = new Map<string, RecapRow>();
  for (const m of mistakes) {
    const key = mistakeKey(m);
    const row = by.get(key);
    if (row) {
      row.count += 1;
      row.shielded = row.shielded || m.shielded;
      continue;
    }
    const fetched = explanations[key]?.text?.trim();
    const r: RecapRow = {
      key, itemText: m.itemText, answerLabel: m.answerLabel, correctLabel: m.correctLabel,
      why: fetched || m.message, shielded: m.shielded, count: 1,
    };
    by.set(key, r);
    order.push(r);
  }
  return { rows: order.slice(0, max), more: Math.max(0, order.length - max) };
}
