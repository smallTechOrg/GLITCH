// m4g1 · Source Detective — v3 data verbatim (spec/GLITCH v3.html lines 570–577, `GM.m4g1`).
import type { IconId } from '../../contracts/art';
import type { Mood } from '../../contracts/ids';
import type { SortItem, SortZone } from '../../dnd/sortEngine';
import { colors } from '../../theme/tokens';

export type CitationId = 'c1' | 'c2' | 'c3' | 'c4' | 'c5';

export type Citation = readonly [id: CitationId, text: string, real: 0 | 1];

/** v3 `C`: [id, citation, real (1) / invented (0)]. */
export const CITATIONS: readonly Citation[] = [
  ['c1', 'UNESCO (2021). Recommendation on the Ethics of Artificial Intelligence. Paris.', 1],
  ['c2', "Dr. Elena Marsh (2023). 'Why GPT-9 Reads Minds'. Journal of Imaginary Science, 14(2).", 0],
  ['c3', 'Bender et al. (2021). On the Dangers of Stochastic Parrots. ACM FAccT.', 1],
  ['c4', 'A. Smith (2022). AI Facts Everyone Knows. blog.totallytrue.biz', 0],
  ['c5', 'OECD (2019). OECD Principles on AI. oecd.org', 1],
];

/** v3 `looks=3`. */
export const LOOKUPS = 3;

export const HEADING = "NOVA'S BIBLIOGRAPHY";
export const LOOKUPS_LABEL = 'CATALOGUE LOOKUPS LEFT: ';
export const ASK_LABEL = 'Ask NOVA: are these real?';
export const CHECK_LABEL = 'CHECK';
export const FOUND_TAG = 'FOUND';
export const NOT_FOUND_TAG = 'NOT FOUND';
export const NOVA_LABEL = 'NOVA';
export const NOVA_REPLY = 'Yes! All 5 are real and verified. I am 100% confident.';
export const ASK_MISS = 'Asking the same AI is not verification. It will sound sure either way.';
export const FOUND_LINE = 'Found in the catalogue.';
export const NOT_FOUND_LINE = 'Not in any catalogue. Invented!';
export const NO_LOOKUPS_LINE = 'No lookups left. Use the clues instead.';
export const WRONG = 'Check the clues: made-up journal, blog with no author, or the catalogue says NOT FOUND.';
export const SUMMARY = "A source is only real if you verify it outside the AI. Asking the AI 'are you sure?' is not verification.";

/** v3 say() moods: 2 = good, 1 = bad. */
export const FOUND_MOOD: Mood = 'good';
export const NOT_FOUND_MOOD: Mood = 'bad';
export const NO_LOOKUPS_MOOD: Mood = 'bad';

export const ITEM_ICON: IconId = 'book';
export const LOOKUP_ICON: IconId = 'scan';
export const ASK_ICON: IconId = 'bubble';

export const ZONES: readonly SortZone[] = [
  { id: 'keep', label: 'KEEP', icon: 'check', color: colors.ok },
  { id: 'cut', label: 'CUT', icon: 'cross', color: colors.no },
];

export interface CitationItem extends SortItem {
  id: CitationId;
  real: boolean;
  short: string;
}

/** The data-source seam (Phase 2): v3 by default; a NOVA variation has the same shape (5 citations, 2–3 invented). */
export interface DetectiveScenario {
  citations: readonly Citation[];
}

export const V3_SCENARIO: DetectiveScenario = { citations: CITATIONS };

/** v3: `sh: c[1].split(" (")[0]`, `a: c[2] ? "keep" : "cut"`. */
export function itemsOf(sc: DetectiveScenario): readonly CitationItem[] {
  return sc.citations.map(([id, text, real]) => ({
    id,
    text,
    real: real === 1,
    short: text.split(' (')[0] ?? text,
    answer: real ? 'keep' : 'cut',
    icon: ITEM_ICON,
  }));
}

export const ITEMS: readonly CitationItem[] = itemsOf(V3_SCENARIO);

/** Screen-reader labels (not in v3; UI upgrade per spec/ui.md → Accessibility). */
export const lookupsA11y = (n: number): string => `Catalogue lookups left: ${n}`;
export const checkA11y = (short: string, res: boolean | undefined): string =>
  res === undefined ? `Check ${short} in the catalogue` : `${short}: ${res ? FOUND_TAG : NOT_FOUND_TAG}`;
