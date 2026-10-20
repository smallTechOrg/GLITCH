// m2g2 · Prompt Forge — Phase 3 mistake payloads (wrong drop in forge 1 and forge 2: wrong slot
// and decoy), X-RAY/FOCUS record nothing. The free-write payload: tests/features/freewrite.
import game from '@/games/m2g2';
import { WRONG_DECOY, WRONG_SLOT } from '@/games/m2g2/data';
import { SORT_DONE_DELAY_MS } from '@/dnd/sortEngine';
import { mount, place, power, press, tick } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const m = (itemId: string, answer: string, correct: string, itemText: string, answerLabel: string, correctLabel: string) => ({
  itemId, answer, correct, concept: 'Prompt engineering', itemText, answerLabel, correctLabel, explain: true,
});

describe('m2g2 mistakes', () => {
  it('forge 1: a decoy → correct `decoy`; a block in the wrong slot → its own slot', async () => {
    const api = await mount(game);
    await place('b0', 'task');
    await place('b2', 'role');
    expect(api.calls.miss).toEqual([WRONG_DECOY, WRONG_SLOT]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      m('f1.b0', 'task', 'decoy', 'Help me study.', 'TASK', 'NO SLOT · TOO VAGUE'),
      m('f1.b2', 'role', 'ctx', "I have 3 hours a day and I'm weak at algebra.", 'ROLE', 'CONTEXT'),
    ]);
  });

  it('forge 2 ids are f2.b<i>', async () => {
    const api = await mount(game);
    for (const [i, z] of [['b1', 'task'], ['b2', 'ctx'], ['b3', 'role'], ['b4', 'fmt'], ['b5', 'lim']] as const) await place(i, z);
    await tick(SORT_DONE_DELAY_MS);
    await press('m2g2-next-forge');
    await place('b1', 'ctx');
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      m('f2.b1', 'ctx', 'task', 'Write an email asking Mr. Rao for a 2-day extension on my history essay.', 'CONTEXT', 'TASK'),
    ]);
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'hint')).toBe(true);
    expect(await power(api, 'scan')).toBe(true);
    expect(api.recorded).toEqual([]);
  });
});
