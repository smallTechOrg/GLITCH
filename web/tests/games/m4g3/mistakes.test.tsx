// m4g3 · Design the Companion — Phase 3 mistake payload (SHIP IT fails: first failing metric), X-RAY/FOCUS record nothing.
import game from '@/games/m4g3';
import { mount, power, press } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const ship = (answer: string, answerLabel: string) => ({
  itemId: 'ship', answer, correct: 'all_met', concept: 'Human oversight', itemText: 'SHIP THE COMPANION', answerLabel, correctLabel: 'ALL 5 TARGETS MET', explain: true,
});

describe('m4g3 mistakes', () => {
  it('SHIP IT at the start → first failing metric `well`; the metric the message names', async () => {
    const api = await mount(game);
    await press('m4g3-ship');
    expect(api.calls.miss).toEqual(['Not yet: wellbeing is too low.']);
    expect(api.recorded.map((r) => r.mistake)).toEqual([ship('well', 'WELLBEING OFF TARGET')]);
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'hint')).toBe(true);
    expect(await power(api, 'scan')).toBe(true);
    expect(api.recorded).toEqual([]);
  });
});
