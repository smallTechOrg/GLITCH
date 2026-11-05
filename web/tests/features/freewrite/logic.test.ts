// Pure round rules: goal bank + pick, API result → outcome (every fallback), banners,
// X-RAY / FOCUS lines, history entries, reply formatting.
import type { ApiResult, FreewriteEvaluateData } from '@/contracts/api';
import { COPY, GOAL_BANK, LEVER_TIP } from '@/features/freewrite/data';
import { checkLevers, countHit, wordCount } from '@/features/freewrite/levers';
import {
  bannerText, focusLine, formatReply, historyEntry, offlineOutcome, outcomeFromResult, pickGoal, xrayLine,
} from '@/features/freewrite/logic';
import { cleanHistoryEntry } from '@/state/migrate';

const g1 = GOAL_BANK[0]!;
const ENERGY = { remaining: 9, limit: 10, resetsAt: '2026-10-21T00:00:00Z' };
const ok = (over: Partial<FreewriteEvaluateData> = {}): ApiResult<FreewriteEvaluateData> => ({
  ok: true,
  data: {
    reply: '[DEMO NOVA] Here is my answer.',
    levers: { task: true, context: true, role: true, format: true, limit: false },
    leversHit: 4,
    passed: true,
    tip: 'Add a limit.',
    provider: 'fake',
    model: 'fake-demo',
    ...over,
  },
  energy: ENERGY,
});

describe('goal bank', () => {
  it('has the six spec goals in order', () => {
    expect(GOAL_BANK.map((g) => [g.id, g.goal])).toEqual([
      ['fw1', 'Explain photosynthesis to a 10-year-old.'],
      ['fw2', 'Plan a 3-day revision timetable for your science test.'],
      ['fw3', 'Write a message asking your coach to move practice to Thursday.'],
      ['fw4', 'Get ideas for a school poster about saving water.'],
      ['fw5', 'Summarise the causes of World War I for a quiz tomorrow.'],
      ['fw6', 'Write a short thank-you note to a teacher.'],
    ]);
  });

  it('gives each goal an offline reply of at most 80 words and lever examples that really hit their levers', () => {
    for (const g of GOAL_BANK) {
      expect(wordCount(g.offlineReply)).toBeLessThanOrEqual(80);
      expect(g.goal.length).toBeLessThanOrEqual(200);
      const joined = Object.values(g.examples).join('. ');
      expect(countHit(checkLevers(joined))).toBe(5);
      for (const k of ['context', 'role', 'format', 'limit'] as const) expect(checkLevers(g.examples[k])[k]).toBe(true);
    }
  });
});

describe('pickGoal', () => {
  it('picks the first unattempted goal in bank order', () => {
    expect(pickGoal([]).id).toBe('fw1');
    expect(pickGoal([{ goalId: 'fw1' }]).id).toBe('fw2');
    expect(pickGoal([{ goalId: 'fw2' }, { goalId: 'fw1' }, { goalId: 'fw4' }]).id).toBe('fw3');
  });

  it('wraps after every goal was attempted (next after the newest attempt)', () => {
    const all = ['fw3', 'fw1', 'fw2', 'fw4', 'fw5', 'fw6'].map((goalId) => ({ goalId }));
    expect(pickGoal(all).id).toBe('fw4');
    expect(pickGoal([{ goalId: 'fw6' }, ...all]).id).toBe('fw1');
  });
});

describe('outcomeFromResult', () => {
  it('maps a demo-provider success to source demo with the DEMO tag', () => {
    const o = outcomeFromResult(g1, 'p', ok());
    expect(o).toMatchObject({ source: 'demo', demo: true, leversHit: 4, passed: true, tip: 'Add a limit.', replyLabel: COPY.replyLabel, fallback: null, energy: ENERGY });
  });

  it('maps an openrouter success to source nova and recomputes passed from the booleans', () => {
    const o = outcomeFromResult(g1, 'p', ok({ provider: 'openrouter', passed: true, leversHit: 5, levers: { task: true, context: false, role: false, format: true, limit: false } }));
    expect(o).toMatchObject({ source: 'nova', demo: false, leversHit: 2, passed: false });
  });

  it.each([
    ['TIMEOUT', 'offline'],
    ['NETWORK', 'offline'],
    ['AI_TIMEOUT', 'offline'],
    ['AI_UNAVAILABLE', 'offline'],
    ['AI_INVALID_OUTPUT', 'offline'],
    ['INTERNAL', 'offline'],
    ['BAD_REQUEST', 'offline'],
    ['MODERATED', 'moderated'],
    ['CAP_DEVICE', 'flat'],
    ['CAP_GLOBAL', 'resting'],
  ])('falls back to the offline check on %s (%s)', (code, reason) => {
    const r = { ok: false, error: { code, message: 'x', retryable: false } } as ApiResult<FreewriteEvaluateData>;
    const o = outcomeFromResult(g1, 'plants', r);
    expect(o).toMatchObject({ source: 'offline', fallback: reason, reply: g1.offlineReply, replyLabel: COPY.classicLabel, leversHit: 0, passed: false, tip: LEVER_TIP.task, demo: false });
  });

  it('offline check of the strong fixture passes with the all-five tip', () => {
    const o = offlineOutcome(g1, 'Act as a friendly science teacher. Explain photosynthesis to my 10-year-old brother, who loves plants. Use 3 short bullet points. Keep it under 80 words.', 'offline');
    expect(o).toMatchObject({ leversHit: 5, passed: true });
  });
});

describe('copy', () => {
  it('renders each fallback banner in-world', () => {
    const now = new Date('2026-10-20T21:30:00Z');
    expect(bannerText('offline', undefined, now)).toBe("NOVA'S OFFLINE — HERE'S THE CLASSIC CHECKLIST");
    expect(bannerText('moderated', undefined, now)).toBe("NOVA'S REPLY GOT CAUGHT BY THE SAFETY FILTER — THE CLASSIC CHECKLIST WILL SCORE YOU.");
    expect(bannerText('resting', undefined, now)).toBe('NOVA IS RESTING — TOO MANY AGENTS TODAY.');
    expect(bannerText('flat', '2026-10-21T00:00:00Z', now)).toBe("NOVA'S BATTERY IS FLAT FOR TODAY. RECHARGES IN 3H.");
  });

  it('X-RAY lists hit and missing levers', () => {
    expect(xrayLine({ task: true, context: false, role: true, format: false, limit: false })).toBe('X-RAY: your draft has TASK, ROLE. Missing: CONTEXT, FORMAT, LIMIT.');
    expect(xrayLine(checkLevers('plants'))).toBe('X-RAY: your draft has no levers yet. Missing: TASK, CONTEXT, ROLE, FORMAT, LIMIT.');
    expect(xrayLine({ task: true, context: true, role: true, format: true, limit: true })).toBe('X-RAY: your draft has TASK, CONTEXT, ROLE, FORMAT, LIMIT. Missing: nothing.');
  });

  it("FOCUS names the first missed lever with the goal's example phrase", () => {
    expect(focusLine(g1, '')).toBe("FOCUS: add a TASK, e.g. 'Explain photosynthesis'");
    expect(focusLine(g1, 'Act as a teacher and explain plants to me please')).toBe("FOCUS: add a CONTEXT, e.g. 'to my 10-year-old brother who loves plants'");
    expect(focusLine(g1, 'Act as a teacher. Explain plants to my brother in a list under 50 words.')).toBe('FOCUS: your draft looks strong. Send it!');
  });
});

describe('historyEntry', () => {
  it('builds a valid PromptHistoryEntry the store accepts', () => {
    const o = outcomeFromResult(g1, 'plants', ok());
    const e = historyEntry('id-1', g1, 'plants', o, new Date('2026-10-20T10:00:00Z'));
    expect(e).toEqual({ id: 'id-1', goalId: 'fw1', goal: g1.goal, prompt: 'plants', levers: o.levers, leversHit: 4, passed: true, source: 'demo', at: '2026-10-20T10:00:00.000Z' });
    expect(cleanHistoryEntry(e)).toEqual(e);
  });
});

describe('formatReply', () => {
  it('turns light markdown into readable lines', () => {
    expect(formatReply('**Plants** eat light\n\n- one\n* two\n| Day | Topic |\n|---|---|\n| 1 | Cells |\n## Done')).toEqual([
      'Plants eat light',
      '• one',
      '• two',
      'Day · Topic',
      '1 · Cells',
      'Done',
    ]);
  });

  it('returns no lines for an empty reply', () => {
    expect(formatReply('  \n ')).toEqual([]);
  });
});
