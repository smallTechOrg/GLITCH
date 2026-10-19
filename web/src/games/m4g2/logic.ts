// m4g2 · Confidence Court — pure rules (v3 lines 578–580): a plain zones-on-top sort.
import type { SortConfig } from '../../dnd/sortEngine';
import { ITEMS, WRONG, ZONES, type AnswerItem } from './data';

export const SORT_CONFIG: SortConfig<AnswerItem> = {
  items: ITEMS,
  zones: ZONES,
  wrong: () => WRONG,
};

/** The answer key as [itemId, zoneId] pairs, v3 order. */
export const ANSWER_KEY: readonly (readonly [string, string])[] = ITEMS.map((it) => [it.id, it.answer ?? ''] as const);
