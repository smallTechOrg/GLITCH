// m3g2 · Fairness Lab — pure maths, audit and power logic (v3 lines 558–568).
import type { Mistake } from '../../contracts/game';
import { buildMistake } from '../mistake';
import {
  ACCURACY_BASE, ACCURACY_GOAL, AUDIT_ITEM_TEXT, AUDIT_PASS_LABEL, FEATURES, GAP_BASE, GAP_GOAL, MEN_SHORTLISTED, PASS_LINE,
  PROXY_ACCURACY_BONUS, accuracyFailLabel, accuracyFailMessage, gapFailLabel, gapFailMessage, type FeatureId,
} from './data';

export type OnMap = Record<FeatureId, boolean>;
export interface Metrics {
  accuracy: number;
  gap: number;
}
export interface AuditResult {
  pass: boolean;
  message: string; // PASS_LINE on pass, else the v3 miss() message
}

export const FEATURE_IDS: readonly FeatureId[] = FEATURES.map((f) => f[0]);

const featureById = (id: FeatureId) => FEATURES.find((f) => f[0] === id);

/** v3: every feature starts ON. */
export function initialOn(): OnMap {
  const on = {} as OnMap;
  for (const id of FEATURE_IDS) on[id] = true;
  return on;
}

/** accuracy = 50 + Σ(skill weight on) + 2·(proxies on); gap = 2 + Σ(proxy weight on). */
export function calc(on: Readonly<OnMap>): Metrics {
  let accuracy = ACCURACY_BASE;
  let gap = GAP_BASE;
  for (const [id, , kind, w] of FEATURES) {
    if (!on[id]) continue;
    if (kind === 's') accuracy += w;
    else {
      accuracy += PROXY_ACCURACY_BONUS;
      gap += w;
    }
  }
  return { accuracy, gap };
}

export const womenShortlisted = (m: Metrics): number => MEN_SHORTLISTED - m.gap;

/** v3 pass check, exact: gap ≤ 6 AND accuracy ≥ 80. */
export const passes = (m: Metrics): boolean => m.gap <= GAP_GOAL && m.accuracy >= ACCURACY_GOAL;

/** v3 "RUN AUDIT ▶": pass, else the gap message if gap > 6, else the accuracy message. */
export function audit(on: Readonly<OnMap>): AuditResult {
  const m = calc(on);
  if (passes(m)) return { pass: true, message: PASS_LINE };
  if (m.gap > GAP_GOAL) return { pass: false, message: gapFailMessage(m.gap) };
  return { pass: false, message: accuracyFailMessage(m.accuracy) };
}

/**
 * RUN AUDIT fails (mistake table): itemId `audit`, answer `gap` (gap > 6, checked first like the
 * message) or `accuracy`, correct `pass`. Undefined when the audit passes.
 */
export function auditMistake(on: Readonly<OnMap>): Mistake | undefined {
  const m = calc(on);
  if (passes(m)) return undefined;
  const gap = m.gap > GAP_GOAL;
  return buildMistake('m3g2', {
    itemId: 'audit',
    answer: gap ? 'gap' : 'accuracy',
    correct: 'pass',
    itemText: AUDIT_ITEM_TEXT,
    answerLabel: gap ? gapFailLabel(m.gap) : accuracyFailLabel(m.accuracy),
    correctLabel: AUDIT_PASS_LABEL,
  });
}

export function toggle(on: Readonly<OnMap>, id: FeatureId): OnMap {
  return { ...on, [id]: !on[id] };
}

/** Correct state: skills ON, proxies OFF. */
export const correctState = (id: FeatureId): boolean => featureById(id)?.[2] === 's';

/** X-RAY: fix the first feature (list order) not in its correct state; null if none. */
export function xrayFix(on: Readonly<OnMap>): { id: FeatureId; name: string; on: OnMap } | null {
  for (const [id, name] of FEATURES) {
    const want = correctState(id);
    if (on[id] !== want) return { id, name, on: { ...on, [id]: want } };
  }
  return null;
}

/** FOCUS: the first proxy still on; null if none. */
export function focusTarget(on: Readonly<OnMap>): { id: FeatureId; name: string } | null {
  for (const [id, name, kind] of FEATURES) if (kind === 'p' && on[id]) return { id, name };
  return null;
}
