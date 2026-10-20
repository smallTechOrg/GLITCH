// m3g2 · Fairness Lab — v3 data, constants and copy, verbatim from spec/idea/GLITCH v3.html
// lines 558–568 (GM.m3g2). Feature tuple shape kept from v3: [id, name, kind, weight],
// kind 's' = skill (adds weight to accuracy), 'p' = proxy (adds weight to the gap, +2 accuracy).

export const TITLE = 'Fairness Lab';
export const GOAL = 'SIMULATE · GAP ≤ 6 · ACCURACY ≥ 80';
export const INTRO = 'Switch features on or off. Fix the gap without wrecking accuracy.';

export type FeatureId = 'code' | 'gpa' | 'int' | 'col' | 'cap' | 'brk' | 'pc';
export type FeatureKind = 's' | 'p';
export type Feature = readonly [id: FeatureId, name: string, kind: FeatureKind, weight: number];

/** v3 `F` — list order matters (X-RAY / FOCUS walk it front to back). All start ON. */
export const FEATURES: readonly Feature[] = [
  ['code', 'Coding test score', 's', 14],
  ['gpa', 'GPA', 's', 10],
  ['int', 'Internship', 's', 12],
  ['col', "Women's college", 'p', 10],
  ['cap', "Girls' team captain", 'p', 6],
  ['brk', 'Career break', 'p', 8],
  ['pc', 'Postcode', 'p', 5],
];

/** v3 `calc`: a = 50, g = 2; each proxy on adds +2 to accuracy. */
export const ACCURACY_BASE = 50;
export const GAP_BASE = 2;
export const PROXY_ACCURACY_BONUS = 2;
/** v3 `draw`: men = 48, women = men − gap. */
export const MEN_SHORTLISTED = 48;
/** v3 bar height factor: `height: pct * 1.6 px`. */
export const BAR_PX_PER_PCT = 1.6;
export const GAP_GOAL = 6; // ≤
export const ACCURACY_GOAL = 80; // ≥
export const WIN_DELAY_MS = 500;
/** v3 FOCUS flash duration. */
export const FLASH_MS = 2200;

export const HEADING = 'THE SCREENER · FEATURES';
export const RULE_LINE = 'Which inputs does the AI use? Skill features measure ability. The rest may be proxies.';
export const MEN_LABEL = 'MEN SHORTLISTED';
export const WOMEN_LABEL = 'WOMEN SHORTLISTED';
export const GAP_LABEL = 'GAP';
export const ACCURACY_LABEL = 'ACCURACY';
export const AUDIT_LABEL = 'RUN AUDIT ▶';
/** Screen-reader name of the audit button: the ▶ glyph is decoration, not part of the name. */
export const AUDIT_A11Y_LABEL = 'RUN AUDIT';
export const PASS_LINE = 'Audit passed. Fair and accurate.';
export const gapFailMessage = (gap: number): string => `The gap is still ${gap} points. Some proxies are still switched on.`;
export const accuracyFailMessage = (acc: number): string => `Accuracy fell to ${acc}%. Keep the skill features on.`;
export const xrayLine = (name: string): string => `X-RAY: I fixed ${name}.`;
export const focusLine = (name: string): string => `FOCUS: ${name} is still on, and it can stand in for gender.`;
/** Phase 3 mistake copy (per-game mistake table, m3g2 RUN AUDIT fails). */
export const AUDIT_ITEM_TEXT = 'THE SCREENER AUDIT';
export const gapFailLabel = (gap: number): string => `GAP ${gap} · GOAL ≤ ${GAP_GOAL}`;
export const accuracyFailLabel = (acc: number): string => `ACCURACY ${acc}% · GOAL ≥ ${ACCURACY_GOAL}`;
export const AUDIT_PASS_LABEL = `GAP ≤ ${GAP_GOAL} · ACCURACY ≥ ${ACCURACY_GOAL}`;
export const WIN_SUMMARY =
  'Removing the sensitive column is not enough. Remove the proxies, keep the real skill signals, then test outcomes for each group.';
