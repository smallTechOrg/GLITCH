// m1g2 · Fact or Fib — Phase 3 mistake payload (tap on a true line), X-RAY/FOCUS record nothing.
import game from '@/games/m1g2';
import { TRUE_MISS } from '@/games/m1g2/data';
import { mount, power, press } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('m1g2 mistakes', () => {
  it('a true line → s<index> payload, fib vs true', async () => {
    const api = await mount(game);
    await press('pick-line-0');
    await press('pick-line-4');
    await press('pick-line-1'); // a fib: no mistake
    expect(api.calls.miss).toEqual([TRUE_MISS, TRUE_MISS]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      { itemId: 's0', answer: 'fib', correct: 'true', concept: 'Machine learning', itemText: 'Machine learning finds patterns in training data.', answerLabel: 'FIB', correctLabel: 'TRUE', explain: true },
      { itemId: 's4', answer: 'fib', correct: 'true', concept: 'Machine learning', itemText: 'Traditional software follows rules that a person wrote.', answerLabel: 'FIB', correctLabel: 'TRUE', explain: true },
    ]);
  });

  it('X-RAY (catch a fib) and FOCUS (mark a true line) never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'scan')).toBe(true);
    expect(await power(api, 'hint')).toBe(true);
    expect(api.calls.miss).toEqual([]);
    expect(api.recorded).toEqual([]);
  });
});
