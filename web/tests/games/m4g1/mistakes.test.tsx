// m4g1 · Source Detective — Phase 3 mistake payloads (wrong drop, the "Ask NOVA" trap), X-RAY/FOCUS record nothing.
import game from '@/games/m4g1';
import { ASK_MISS, WRONG } from '@/games/m4g1/data';
import { mount, place, power, press } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('m4g1 mistakes', () => {
  it('wrong drop → citation payload (correct = real ? keep : cut)', async () => {
    const api = await mount(game);
    await place('c5', 'cut');
    await place('c2', 'keep');
    expect(api.calls.miss).toEqual([WRONG, WRONG]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      { itemId: 'c5', answer: 'cut', correct: 'keep', concept: 'Hallucination', itemText: 'OECD (2019). OECD Principles on AI. oecd.org', answerLabel: 'CUT', correctLabel: 'KEEP', explain: true },
      {
        itemId: 'c2', answer: 'keep', correct: 'cut', concept: 'Hallucination',
        itemText: "Dr. Elena Marsh (2023). 'Why GPT-9 Reads Minds'. Journal of Imaginary Science, 14(2).", answerLabel: 'KEEP', correctLabel: 'CUT', explain: true,
      },
    ]);
  });

  it('"Ask NOVA" → the `ask` payload, concept Verification (once only)', async () => {
    const api = await mount(game);
    await press('m4g1-ask-nova');
    expect(api.calls.miss).toEqual([ASK_MISS]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      { itemId: 'ask', answer: 'ask_nova', correct: 'lookup', concept: 'Verification', itemText: 'ASK NOVA TO CHECK ITS OWN SOURCES', answerLabel: 'ASKED NOVA', correctLabel: 'CHECK THE CATALOGUE', explain: true },
    ]);
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'scan')).toBe(true);
    expect(await power(api, 'hint')).toBe(true);
    expect(api.recorded).toEqual([]);
  });
});
