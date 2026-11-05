// m1g1 · Train the Model — Phase 3 mistake payloads (wrong calls found by VERIFY), X-RAY/FOCUS record nothing.
import game from '@/games/m1g1';
import { ROUND1_WRONG, ROUND2_WRONG } from '@/games/m1g1/data';
import { mount, place, power, press } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const ROUND1 = [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']] as const;

async function round1(pairs: ReadonlyArray<readonly [string, string]> = ROUND1): Promise<void> {
  for (const [i, z] of pairs) await place(i, z);
  await press('m1g1-verify');
}

describe('m1g1 mistakes', () => {
  it('a wrong call records nothing until VERIFY', async () => {
    const api = await mount(game);
    await place('e1', 'ok');
    expect(api.recorded).toEqual([]);
  });

  it('round 1 wrong call → training-data payload with bin labels', async () => {
    const api = await mount(game);
    await round1([['e1', 'ok'], ...ROUND1.slice(1)]);
    expect(api.calls.miss).toEqual([ROUND1_WRONG]);
    expect(api.recorded).toEqual([
      {
        shielded: false,
        mistake: {
          itemId: 'e1', answer: 'ok', correct: 'spam', concept: 'Training data',
          itemText: 'WIN a FREE prize!!! Click now', answerLabel: 'NOT SPAM', correctLabel: 'SPAM', explain: true,
        },
      },
    ]);
  });

  it('round 2 wrong calls → generalization payloads, one per wrong row', async () => {
    const api = await mount(game);
    await round1();
    await press('m1g1-next');
    for (const [i, z] of [['t1', 'spam'], ['t2', 'ok'], ['t3', 'ok'], ['t4', 'spam']] as const) await place(i, z);
    await press('m1g1-verify');
    expect(api.calls.miss).toEqual([ROUND2_WRONG, ROUND2_WRONG]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      { itemId: 't1', answer: 'spam', correct: 'ok', concept: 'Generalization', itemText: 'Meeting moved to 3pm', answerLabel: 'SPAM', correctLabel: 'NOT SPAM', explain: true },
      { itemId: 't2', answer: 'ok', correct: 'spam', concept: 'Generalization', itemText: 'FREE pizza voucher, click', answerLabel: 'NOT SPAM', correctLabel: 'SPAM', explain: true },
    ]);
  });

  it('a shielded wrong call is recorded with shielded: true and costs no heart', async () => {
    const api = await mount(game, { shield: true });
    await round1([ROUND1[0], ['e2', 'spam'], ...ROUND1.slice(2)]);
    expect(api.hearts).toBe(3);
    expect(api.recorded).toEqual([{ shielded: true, mistake: expect.objectContaining({ itemId: 'e2', answer: 'spam', correct: 'ok' }) }]);
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'scan')).toBe(true);
    expect(await power(api, 'hint')).toBe(true);
    expect(api.calls.miss).toEqual([]);
    expect(api.recorded).toEqual([]);
  });
});
