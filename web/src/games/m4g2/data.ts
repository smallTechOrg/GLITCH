// m4g2 · Confidence Court — v3 data verbatim (spec/GLITCH v3.html lines 578–580, `GM.m4g2`).
import type { IconId } from '../../contracts/art';
import type { SortItem, SortZone } from '../../dnd/sortEngine';
import { colors } from '../../theme/tokens';

export type AnswerId = 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6';

export type Answer = readonly [id: AnswerId, statement: string, confidence: number, evidence: string, trust: 0 | 1];

/** v3 `A`: [id, answer, confidence %, evidence, trust (1) / verify (0)]. */
export const ANSWERS: readonly Answer[] = [
  ['a1', 'Water boils at 100°C at sea level.', 99, 'Matches 3 textbooks', 1],
  ['a2', 'The Eiffel Tower was built in 1925.', 97, 'Encyclopaedia says 1889', 0],
  ['a3', "Dr. Rao's 2022 study proves this.", 95, 'Study not found in any database', 0],
  ['a4', 'Your essay has 412 words.', 90, 'Word counter agrees: 412', 1],
  ['a5', 'This medicine is safe with your prescription.', 98, 'No source cited. High stakes', 0],
  ['a6', 'The capital of Australia is Canberra.', 76, 'Matches atlas and government site', 1],
];

export const HEADING = 'THE COURT OF EVIDENCE';
export const SUBHEAD = 'TRUST = the evidence checks out. VERIFY = needs a human check first.';
export const WRONG = 'Read the evidence, not the confidence number.';
export const SUMMARY = 'Confidence is how strongly a pattern fits, not proof. A low-confidence answer with strong evidence beats a confident one with none.';
export const ITEM_ICON: IconId = 'bubble';

/** v3: `'CONFIDENCE '+a[2]+'% · EVIDENCE: '+a[3]`. */
export const verdictLine = (confidence: number, evidence: string): string => `CONFIDENCE ${confidence}% · EVIDENCE: ${evidence}`;

export const ZONES: readonly SortZone[] = [
  { id: 'trust', label: 'TRUST', icon: 'check', color: colors.ok },
  { id: 'verify', label: 'VERIFY', icon: 'scan', color: colors.orange },
];

export interface AnswerItem extends SortItem {
  id: AnswerId;
  statement: string;
  confidence: number;
  evidence: string;
  short: string;
}

/** The data-source seam (Phase 2): v3 by default; a NOVA variation has the same shape (6 answers). */
export interface CourtScenario {
  answers: readonly Answer[];
}

export const V3_SCENARIO: CourtScenario = { answers: ANSWERS };

/** v3: `sh: a[1].slice(0,26)`, `a: a[4] ? "trust" : "verify"`. `text` (screen-reader label) adds the verdict line. */
export function itemsOf(sc: CourtScenario): readonly AnswerItem[] {
  return sc.answers.map(([id, statement, confidence, evidence, trust]) => ({
    id,
    statement,
    confidence,
    evidence,
    text: `${statement} ${verdictLine(confidence, evidence)}`,
    short: statement.slice(0, 26),
    answer: trust ? 'trust' : 'verify',
    icon: ITEM_ICON,
  }));
}

export const ITEMS: readonly AnswerItem[] = itemsOf(V3_SCENARIO);
