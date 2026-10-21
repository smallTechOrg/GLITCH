// Pure rules for the free-write round: goal pick, API result → round outcome (incl. every
// in-world fallback), X-RAY / FOCUS lines, history entries. No clocks or randomness here —
// callers inject `now` and ids.
import type { ApiResult, EnergyDTO, FreewriteEvaluateData } from '../../contracts/api';
import { LEVER_IDS } from '../../contracts/ids';
import type { LeverMap, PromptHistoryEntry, PromptSource } from '../../contracts/state';
import { COPY, GOAL_BANK, LEVER_LABEL, type Goal } from './data';
import { checkLevers, countHit, firstMissed, isPassing, offlineTip } from './levers';
import { hoursUntil } from '../../ui/EnergyMeter';

/** First goal with no history entry (bank order); all attempted → the one after the newest attempt. */
export function pickGoal(history: readonly Pick<PromptHistoryEntry, 'goalId'>[], bank: readonly Goal[] = GOAL_BANK): Goal {
  const first = bank[0];
  if (!first) throw new Error('empty goal bank');
  const tried = new Set(history.map((h) => h.goalId));
  const fresh = bank.find((g) => !tried.has(g.id));
  if (fresh) return fresh;
  const newest = history[0];
  const at = newest ? bank.findIndex((g) => g.id === newest.goalId) : -1;
  return bank[(at + 1) % bank.length] ?? first;
}

export type FallbackReason = 'offline' | 'moderated' | 'flat' | 'resting';

export interface RoundOutcome {
  source: PromptSource;
  reply: string;
  replyLabel: string;
  levers: LeverMap;
  leversHit: number;
  passed: boolean;
  tip: string;
  demo: boolean;
  /** Set when the offline check scored the prompt. */
  fallback: FallbackReason | null;
  /** Energy to show after this send (undefined = keep the last known value). */
  energy?: EnergyDTO;
}

/** The deterministic offline check (lever cue rules + the goal's classic answer). */
export function offlineOutcome(goal: Goal, prompt: string, fallback: FallbackReason, energy?: EnergyDTO): RoundOutcome {
  const levers = checkLevers(prompt);
  return {
    source: 'offline',
    reply: goal.offlineReply,
    replyLabel: COPY.classicLabel,
    levers,
    leversHit: countHit(levers),
    passed: isPassing(levers),
    tip: offlineTip(levers),
    demo: false,
    fallback,
    energy,
  };
}

export function fallbackFor(r: Exclude<ApiResult<FreewriteEvaluateData>, { ok: true }>): FallbackReason {
  switch (r.error.code) {
    case 'MODERATED':
      return 'moderated';
    case 'CAP_DEVICE':
      return 'flat';
    case 'CAP_GLOBAL':
      return 'resting';
    default:
      return 'offline';
  }
}

/** Map the evaluate call's result into what the round shows. Never throws. */
export function outcomeFromResult(goal: Goal, prompt: string, r: ApiResult<FreewriteEvaluateData>): RoundOutcome {
  if (r.ok) {
    const levers = {} as LeverMap;
    for (const k of LEVER_IDS) levers[k] = r.data.levers[k] === true;
    const hit = countHit(levers);
    const demo = r.data.provider === 'fake';
    return {
      source: demo ? 'demo' : 'nova',
      reply: r.data.reply,
      replyLabel: COPY.replyLabel,
      levers,
      leversHit: hit,
      // the server computes passed from the booleans; recomputing guards against drift
      passed: hit >= 4,
      tip: r.data.tip,
      demo,
      fallback: null,
      energy: r.energy,
    };
  }
  return offlineOutcome(goal, prompt, fallbackFor(r), r.energy);
}

export function bannerText(reason: FallbackReason, resetsAt: string | undefined, now: Date): string {
  switch (reason) {
    case 'moderated':
      return COPY.moderated;
    case 'resting':
      return COPY.resting;
    case 'flat':
      return COPY.flat(resetsAt ? hoursUntil(resetsAt, now) : 0);
    default:
      return COPY.offline;
  }
}

/** X-RAY bubble for a draft. */
export function xrayLine(levers: LeverMap): string {
  const hit = LEVER_IDS.filter((k) => levers[k]).map((k) => LEVER_LABEL[k]);
  const missed = LEVER_IDS.filter((k) => !levers[k]).map((k) => LEVER_LABEL[k]);
  return COPY.xray(hit.length ? hit.join(', ') : COPY.xrayNoHits, missed.length ? missed.join(', ') : COPY.xrayNoMissing);
}

/** FOCUS bubble: the first missed lever of the draft with the goal's example phrase. */
export function focusLine(goal: Goal, draft: string): string {
  const m = firstMissed(checkLevers(draft));
  return m ? COPY.focus(LEVER_LABEL[m], goal.examples[m]) : COPY.focusStrong;
}

export function historyEntry(id: string, goal: Goal, prompt: string, o: RoundOutcome, now: Date): PromptHistoryEntry {
  return {
    id,
    goalId: goal.id,
    goal: goal.goal,
    prompt,
    levers: { ...o.levers },
    leversHit: o.leversHit,
    passed: o.passed,
    source: o.source,
    at: now.toISOString(),
  };
}

/** Light formatting for NOVA's reply: list markers → "•", bold markers stripped, tables → "a · b". */
export function formatReply(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l))
    .map((l) => {
      let s = l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#{1,6}\s+/, '');
      if (/^[-*•]\s+/.test(s)) s = `• ${s.replace(/^[-*•]\s+/, '')}`;
      if (s.includes('|')) s = s.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join(' · ');
      return s;
    });
}
