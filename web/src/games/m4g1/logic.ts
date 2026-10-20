// m4g1 · Source Detective — pure rules (v3 lines 570–577): catalogue lookups + "Ask NOVA".
import type { Mistake } from '../../contracts/game';
import type { Mood } from '../../contracts/ids';
import type { SortConfig, SortZone } from '../../dnd/sortEngine';
import { buildMistake } from '../mistake';
import {
  ASK_ITEM_TEXT, ASK_MISS, ASKED_NOVA_LABEL, LOOKUP_LABEL, FOUND_LINE, FOUND_MOOD, ITEMS, LOOKUPS, NOT_FOUND_LINE, NOT_FOUND_MOOD, NO_LOOKUPS_LINE, NO_LOOKUPS_MOOD, WRONG, ZONES,
  type CitationId, type CitationItem,
} from './data';

/** Wrong drop (mistake table): itemId = citation id, answer = zone dropped on, correct = `real ? keep : cut`. */
export function citationMistake(it: CitationItem, zone: SortZone): Mistake {
  const correct = it.real ? 'keep' : 'cut';
  return buildMistake('m4g1', {
    itemId: it.id,
    answer: zone.id,
    correct,
    itemText: it.text,
    answerLabel: zone.label,
    correctLabel: ZONES.find((z) => z.id === correct)?.label ?? correct,
  });
}

export function sortConfig(items: readonly CitationItem[] = ITEMS): SortConfig<CitationItem> {
  return { items, zones: ZONES, wrong: () => WRONG, mistake: citationMistake };
}

/** The "Ask NOVA" trap (mistake table): itemId `ask`, answer `ask_nova`, correct `lookup`. */
export const ASK_MISTAKE: Mistake = buildMistake('m4g1', {
  itemId: 'ask',
  answer: 'ask_nova',
  correct: 'lookup',
  itemText: ASK_ITEM_TEXT,
  answerLabel: ASKED_NOVA_LABEL,
  correctLabel: LOOKUP_LABEL,
});

export const SORT_CONFIG: SortConfig<CitationItem> = sortConfig(ITEMS);

export interface DetectiveState {
  readonly lookupsLeft: number;
  /** Lookup results by citation (true = FOUND, false = NOT FOUND). Each item can be checked once. */
  readonly checked: Readonly<Partial<Record<CitationId, boolean>>>;
  readonly asked: boolean;
}

export const createDetective = (): DetectiveState => ({ lookupsLeft: LOOKUPS, checked: {}, asked: false });

export type CheckOutcome =
  | { kind: 'checked'; found: boolean; say: { text: string; mood: Mood } }
  | { kind: 'none-left'; say: { text: string; mood: Mood } }
  | { kind: 'ignored' };

/** v3 `.lkb` click: already checked / unknown → ignored; 0 left → "No lookups left…" (no heart). */
export function check(
  s: DetectiveState,
  id: string,
  items: readonly CitationItem[] = ITEMS,
): { state: DetectiveState; outcome: CheckOutcome } {
  const it = items.find((x) => x.id === id);
  if (!it || s.checked[it.id] !== undefined) return { state: s, outcome: { kind: 'ignored' } };
  if (s.lookupsLeft <= 0) return { state: s, outcome: { kind: 'none-left', say: { text: NO_LOOKUPS_LINE, mood: NO_LOOKUPS_MOOD } } };
  return {
    state: { ...s, lookupsLeft: s.lookupsLeft - 1, checked: { ...s.checked, [it.id]: it.real } },
    outcome: { kind: 'checked', found: it.real, say: it.real ? { text: FOUND_LINE, mood: FOUND_MOOD } : { text: NOT_FOUND_LINE, mood: NOT_FOUND_MOOD } },
  };
}

/** v3 `#ask` click: once only; the caller must `miss(message)` when `miss` is set. */
export function askNova(s: DetectiveState): { state: DetectiveState; miss: string | null } {
  if (s.asked) return { state: s, miss: null };
  return { state: { ...s, asked: true }, miss: ASK_MISS };
}
