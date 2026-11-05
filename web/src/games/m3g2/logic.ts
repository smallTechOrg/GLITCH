// m3g2 · Fairness Lab — pure maths, audit and power logic (v3 lines 558–568).
import type { Mistake } from '../../contracts/game';
import { buildMistake } from '../mistake';
import {
  ACCURACY_BASE, ACCURACY_GOAL, AUDIT_PASS_LABEL, CASES, FEATURES, GAP_BASE, GAP_GOAL, MEN_SHORTLISTED, PASS_LINE,
  PROXY_ACCURACY_BONUS, accuracyFailLabel, accuracyFailMessage, gapFailLabel, gapFailMessage, type DecisionOption, type FairnessCase, type Feature, type FeatureKind,
} from './data';

export type OnMap = Readonly<Record<string, boolean>>;
export interface Metrics {
  accuracy: number;
  gap: number;
}
export interface AuditResult {
  pass: boolean;
  message: string; // PASS_LINE on pass, else the v3 miss() message
}

const HIRING = CASES[0] as FairnessCase;

/** Every input starts OFF: the player chooses what the AI may use. */
export function initialOn(features: readonly Feature[] = FEATURES): OnMap {
  return Object.fromEntries(features.map((f) => [f[0], false]));
}

/** accuracy = 50 + Σ(skill weight on) + 2·(proxies on); gap = 2 + Σ(proxy weight on). */
export function calc(on: OnMap, features: readonly Feature[] = FEATURES): Metrics {
  let accuracy = ACCURACY_BASE;
  let gap = GAP_BASE;
  for (const [id, , kind, w] of features) {
    if (!on[id]) continue;
    if (kind === 's') accuracy += w;
    else {
      accuracy += PROXY_ACCURACY_BONUS;
      gap += w;
    }
  }
  return { accuracy, gap };
}

export const groupBShare = (m: Metrics): number => MEN_SHORTLISTED - m.gap;

/** v3 pass check, exact: gap ≤ 6 AND accuracy ≥ 80. */
export const passes = (m: Metrics): boolean => m.gap <= GAP_GOAL && m.accuracy >= ACCURACY_GOAL;

/** v3 "RUN AUDIT ▶": pass, else the gap message if gap > 6, else the accuracy message. */
export function audit(on: OnMap, features: readonly Feature[] = FEATURES): AuditResult {
  const m = calc(on, features);
  if (passes(m)) return { pass: true, message: PASS_LINE };
  if (m.gap > GAP_GOAL) return { pass: false, message: gapFailMessage(m.gap) };
  return { pass: false, message: accuracyFailMessage(m.accuracy) };
}

/**
 * RUN AUDIT fails: itemId `audit`, answer `gap` (gap > 6, checked first like the message) or
 * `accuracy`, correct `pass`. Undefined on a pass. The API only knows the hiring case's content,
 * so ASK NOVA WHY is offered on that case alone.
 */
export function auditMistake(on: OnMap, c: FairnessCase = HIRING): Mistake | undefined {
  const m = calc(on, c.features);
  if (passes(m)) return undefined;
  const gap = m.gap > GAP_GOAL;
  return buildMistake('m3g2', {
    itemId: 'audit',
    answer: gap ? 'gap' : 'accuracy',
    correct: 'pass',
    itemText: c.auditText,
    answerLabel: gap ? gapFailLabel(m.gap) : accuracyFailLabel(m.accuracy),
    correctLabel: AUDIT_PASS_LABEL,
    explain: c.id === HIRING.id,
  });
}

/** A wrong answer to the case's ethics question. */
export function decisionMistake(c: FairnessCase, picked: DecisionOption): Mistake {
  const right = c.options.find((o) => o.right) as DecisionOption;
  return buildMistake('m3g2', {
    itemId: `decide-${c.id}`,
    answer: picked.id,
    correct: right.id,
    itemText: c.question,
    answerLabel: picked.text,
    correctLabel: right.text,
    explain: false,
  });
}

export function toggle(on: OnMap, id: string): OnMap {
  return { ...on, [id]: !on[id] };
}

/** Correct state: skills ON, proxies OFF. */
export const correctState = (kind: FeatureKind): boolean => kind === 's';

/** X-RAY: fix the first feature (list order) not in its correct state; null if none. */
export function xrayFix(on: OnMap, features: readonly Feature[] = FEATURES): { id: string; name: string; on: OnMap } | null {
  for (const [id, name, kind] of features) {
    const want = correctState(kind);
    if (!!on[id] !== want) return { id, name, on: { ...on, [id]: want } };
  }
  return null;
}

/** FOCUS: the first proxy still on, else the first skill still off; null if all are right. */
export function focusTarget(on: OnMap, features: readonly Feature[] = FEATURES): { id: string; name: string; kind: FeatureKind } | null {
  for (const [id, name, kind] of features) if (kind === 'p' && on[id]) return { id, name, kind };
  for (const [id, name, kind] of features) if (kind === 's' && !on[id]) return { id, name, kind };
  return null;
}
