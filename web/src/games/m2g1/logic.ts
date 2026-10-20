// m2g1 · Tune the Sorter — pure scoring (v3 `tuneRound`, spec/GLITCH v3.html lines 521–540).
import type { Mistake } from '../../contracts/game';
import { buildMistake } from '../mistake';
import { BASE_SCORE, BOTH_GOALS_MET_LABEL, FOCUS_ALL_MET_LINE, FOCUS_PREFIX, OVER_GOAL_SUFFIX, type TuneMessage, type TuneRoundConfig } from './data';

/** score = 10 + wd·f1 + wC·caps + wk·f3 */
export function scoreOf(cfg: TuneRoundConfig, m: TuneMessage, wC: number): number {
  return BASE_SCORE + cfg.wd * m[1] + wC * m[2] + cfg.wk * m[3];
}

export interface TuneRow {
  text: string;
  score: number;
  flagged: boolean;
  truth: boolean;
  ok: boolean;
}

export interface TuneView {
  rows: TuneRow[];
  /** truth=1 but not flagged */
  a: number;
  /** truth=0 but flagged */
  b: number;
  aOk: boolean;
  bOk: boolean;
  passes: boolean;
}

/** flagged iff score ≥ t; passes iff A ≤ ga and B ≤ gb. */
export function evaluate(cfg: TuneRoundConfig, t: number, wC: number): TuneView {
  let a = 0;
  let b = 0;
  const rows = cfg.msgs.map((m) => {
    const score = scoreOf(cfg, m, wC);
    const flagged = score >= t;
    const truth = m[4] === 1;
    const ok = flagged === truth;
    if (!ok) {
      if (truth) a += 1;
      else b += 1;
    }
    return { text: m[0], score, flagged, truth, ok };
  });
  const aOk = a <= cfg.ga;
  const bOk = b <= cfg.gb;
  return { rows, a, b, aOk, bOk, passes: aOk && bOk };
}

export type LockResult = { pass: true } | { pass: false; message: string };

/** "LOCK IT IN": pass, or miss(fa) if A > ga else miss(fb). */
export function lockIn(cfg: TuneRoundConfig, t: number, wC: number): LockResult {
  const v = evaluate(cfg, t, wC);
  if (v.passes) return { pass: true };
  return { pass: false, message: v.a > cfg.ga ? cfg.fa : cfg.fb };
}

/**
 * LOCK IT IN fails (mistake table): itemId = round id, answer `missed` (A > ga, checked first like
 * the message) or `false_alarms`, correct `pass`, itemText = the round title. Undefined on pass.
 */
export function lockMistake(cfg: TuneRoundConfig, t: number, wC: number): Mistake | undefined {
  const v = evaluate(cfg, t, wC);
  if (v.passes) return undefined;
  const missed = v.a > cfg.ga;
  return buildMistake('m2g1', {
    itemId: cfg.id,
    answer: missed ? 'missed' : 'false_alarms',
    correct: 'pass',
    itemText: cfg.title,
    answerLabel: (missed ? cfg.ma : cfg.mbl) + OVER_GOAL_SUFFIX,
    correctLabel: BOTH_GOALS_MET_LABEL,
  });
}

/** FOCUS line: fa if A > ga, else fb if B > gb, else "already meets both goals". */
export function focusLine(cfg: TuneRoundConfig, t: number, wC: number): string {
  const v = evaluate(cfg, t, wC);
  if (v.a > cfg.ga) return FOCUS_PREFIX + cfg.fa;
  if (v.b > cfg.gb) return FOCUS_PREFIX + cfg.fb;
  return FOCUS_ALL_MET_LINE;
}

/** Screen-reader label for one row. */
export function rowLabel(cfg: TuneRoundConfig, r: TuneRow, mismatchTag: string): string {
  return `${r.text}: score ${r.score}, ${r.flagged ? cfg.yes : cfg.no}${r.ok ? '' : `, ${mismatchTag}`}`;
}
