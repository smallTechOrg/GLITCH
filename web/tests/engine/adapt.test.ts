// adaptFor: the Settings help level, or in `auto`, how this game has gone so far.
import type { MistakeRecord, PersistedState } from '@/contracts/state';
import { STRUGGLING_MISTAKES, adaptFor } from '@/engine/adapt';
import { START_POWER_USES, createSession } from '@/engine/session';

const miss = (gameId: MistakeRecord['gameId'], i: number): MistakeRecord => ({
  gameId, variationId: 'v3', itemId: `s${i}`, answer: 'fib', concept: 'Machine learning', shielded: false, at: '2026-10-19T09:00:00.000Z',
});
const state = (over: Partial<Pick<PersistedState, 'stars' | 'mistakes'>> = {}, help: PersistedState['settings']['help'] = 'auto') => ({
  settings: { readableFont: true, help }, stars: {}, mistakes: [], ...over,
});
const misses = (n: number, gameId: MistakeRecord['gameId'] = 'm1g2'): MistakeRecord[] => Array.from({ length: n }, (_, i) => miss(gameId, i));

describe('adaptFor', () => {
  it('auto, no history: the standard power uses and no reason', () => {
    expect(adaptFor(state(), 'm1g2')).toEqual({ powerUses: START_POWER_USES, reason: null });
  });

  it('auto: repeated mistakes on an uncleared game add a use', () => {
    expect(adaptFor(state({ mistakes: misses(STRUGGLING_MISTAKES) }), 'm1g2')).toEqual({ powerUses: START_POWER_USES + 1, reason: 'struggling' });
    expect(adaptFor(state({ mistakes: misses(STRUGGLING_MISTAKES - 1) }), 'm1g2').reason).toBeNull();
  });

  it('auto: only mistakes in this game count', () => {
    expect(adaptFor(state({ mistakes: misses(STRUGGLING_MISTAKES, 'm3g1') }), 'm1g2').reason).toBeNull();
  });

  it('auto: a cleared game gets no struggling help', () => {
    expect(adaptFor(state({ mistakes: misses(5), stars: { m1g2: 1 } }), 'm1g2')).toEqual({ powerUses: START_POWER_USES, reason: null });
  });

  it('auto: three stars makes the next run tougher', () => {
    expect(adaptFor(state({ stars: { m1g2: 3 } }), 'm1g2')).toEqual({ powerUses: START_POWER_USES - 1, reason: 'mastered' });
  });

  it('a chosen help level beats the history', () => {
    expect(adaptFor(state({ stars: { m1g2: 3 } }, 'more'), 'm1g2')).toEqual({ powerUses: START_POWER_USES + 1, reason: 'more' });
    expect(adaptFor(state({ mistakes: misses(9) }, 'less'), 'm1g2')).toEqual({ powerUses: START_POWER_USES - 1, reason: 'less' });
  });

  it('createSession takes the adapted uses and defaults to the standard ones', () => {
    expect(createSession('m1g2', 'scout').powerUses).toBe(START_POWER_USES);
    expect(createSession('m1g2', 'scout', 3).powerUses).toBe(3);
  });
});
