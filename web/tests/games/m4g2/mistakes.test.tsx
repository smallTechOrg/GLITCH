// m4g2 · Confidence Court — Phase 3 mistake payload (wrong drop), X-RAY/FOCUS record nothing.
import game from '@/games/m4g2';
import { WRONG } from '@/games/m4g2/data';
import { mount, place, power } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('m4g2 mistakes', () => {
  it('wrong drop → statement payload (correct = trust ? trust : verify)', async () => {
    const api = await mount(game);
    await place('a2', 'trust');
    await place('a1', 'verify');
    expect(api.calls.miss).toEqual([WRONG, WRONG]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      { itemId: 'a2', answer: 'trust', correct: 'verify', concept: 'Verification', itemText: 'The Eiffel Tower was built in 1925.', answerLabel: 'TRUST', correctLabel: 'VERIFY', explain: true },
      { itemId: 'a1', answer: 'verify', correct: 'trust', concept: 'Verification', itemText: 'Water boils at 100°C at sea level.', answerLabel: 'VERIFY', correctLabel: 'TRUST', explain: true },
    ]);
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'scan')).toBe(true);
    expect(await power(api, 'hint')).toBe(true);
    expect(api.recorded).toEqual([]);
  });
});
