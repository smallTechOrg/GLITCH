// m4g2 · Confidence Court — pure rules (v3 lines 578–580): a plain zones-on-top sort.
import type { SortConfig } from '../../dnd/sortEngine';
import { ITEMS, WRONG, ZONES, type AnswerItem } from './data';

export function sortConfig(items: readonly AnswerItem[] = ITEMS): SortConfig<AnswerItem> {
  return { items, zones: ZONES, wrong: () => WRONG };
}

export const SORT_CONFIG: SortConfig<AnswerItem> = sortConfig(ITEMS);

/** The answer key as [itemId, zoneId] pairs, in scenario order. */
export function answerKey(items: readonly AnswerItem[] = ITEMS): readonly (readonly [string, string])[] {
  return items.map((it) => [it.id, it.answer ?? ''] as const);
}

/** The v3 answer key. */
export const ANSWER_KEY: readonly (readonly [string, string])[] = answerKey(ITEMS);
