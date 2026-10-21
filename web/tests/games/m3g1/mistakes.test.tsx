// m3g1 · Proxy Hunt — Phase 3 mistake payload (tap on a real line), X-RAY/FOCUS record nothing.
import game from '@/games/m3g1';
import { MISS_MESSAGE } from '@/games/m3g1/data';
import { mount, power, press } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('m3g1 mistakes', () => {
  it('a real line → l<index> payload (redacted lines and proxies record nothing)', async () => {
    const api = await mount(game);
    await press('pick-line-0'); // redacted NAME: inert
    await press('pick-line-2'); // a proxy: found
    await press('pick-line-7');
    await press('pick-line-10');
    expect(api.calls.miss).toEqual([MISS_MESSAGE, MISS_MESSAGE]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      { itemId: 'l7', answer: 'proxy', correct: 'real', concept: 'Proxy variables', itemText: 'Skills: Python, SQL', answerLabel: 'PROXY', correctLabel: 'OK', explain: true },
      { itemId: 'l10', answer: 'proxy', correct: 'real', concept: 'Proxy variables', itemText: 'Data Analyst intern, 6 months', answerLabel: 'PROXY', correctLabel: 'OK', explain: true },
    ]);
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'scan')).toBe(true);
    expect(await power(api, 'hint')).toBe(true);
    expect(api.recorded).toEqual([]);
  });
});
