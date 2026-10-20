// m4g2 · Confidence Court — pure rules (v3 lines 578–580): a plain zones-on-top sort.
import type { Mistake } from '../../contracts/game';
import type { SortConfig, SortZone } from '../../dnd/sortEngine';
import { buildMistake } from '../mistake';
import { ITEMS, WRONG, ZONES, type AnswerItem } from './data';

/** Wrong drop (mistake table): itemId = answer id (`a1`–`a6`), answer = zone dropped on, correct = `trust ? trust : verify`. */
export function answerMistake(it: AnswerItem, zone: SortZone): Mistake {
  const correct = it.answer === 'trust' ? 'trust' : 'verify';
  return buildMistake('m4g2', {
    itemId: it.id,
    answer: zone.id,
    correct,
    itemText: it.statement,
    answerLabel: zone.label,
    correctLabel: ZONES.find((z) => z.id === correct)?.label ?? correct,
  });
}

export function sortConfig(items: readonly AnswerItem[] = ITEMS): SortConfig<AnswerItem> {
  return { items, zones: ZONES, wrong: () => WRONG, mistake: answerMistake };
}

export const SORT_CONFIG: SortConfig<AnswerItem> = sortConfig(ITEMS);

/** The answer key as [itemId, zoneId] pairs, in scenario order. */
export function answerKey(items: readonly AnswerItem[] = ITEMS): readonly (readonly [string, string])[] {
  return items.map((it) => [it.id, it.answer ?? ''] as const);
}

/** The v3 answer key. */
export const ANSWER_KEY: readonly (readonly [string, string])[] = answerKey(ITEMS);
