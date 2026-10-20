// m1g1 · Train the Model — Phase 3 mistake payloads (wrong drop step 1 / step 2), X-RAY/FOCUS record nothing.
import game from '@/games/m1g1';
import { STEP1_WRONG, STEP2_WRONG } from '@/games/m1g1/data';
import { mount, place, power, tick } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const STEP1 = [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']] as const;

describe('m1g1 mistakes', () => {
  it('step 1 wrong drop → training-data payload with zone labels', async () => {
    const api = await mount(game);
    await place('e1', 'ok');
    expect(api.calls.miss).toEqual([STEP1_WRONG]);
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

  it('step 2 wrong drop → generalization payload (correct = modelRight ? right : wrong)', async () => {
    const api = await mount(game);
    for (const [i, z] of STEP1) await place(i, z);
    await tick(1000);
    await place('t1', 'right');
    await place('t2', 'wrong');
    expect(api.calls.miss).toEqual([STEP2_WRONG, STEP2_WRONG]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      { itemId: 't1', answer: 'right', correct: 'wrong', concept: 'Generalization', itemText: 'Meeting moved to 3pm', answerLabel: 'RIGHT', correctLabel: 'WRONG', explain: true },
      { itemId: 't2', answer: 'wrong', correct: 'right', concept: 'Generalization', itemText: 'FREE pizza voucher, click', answerLabel: 'WRONG', correctLabel: 'RIGHT', explain: true },
    ]);
  });

  it('a shielded wrong drop is recorded with shielded: true and costs no heart', async () => {
    const api = await mount(game, { shield: true });
    await place('e2', 'spam');
    expect(api.hearts).toBe(3);
    expect(api.recorded).toEqual([{ shielded: true, mistake: expect.objectContaining({ itemId: 'e2', answer: 'spam', correct: 'ok' }) }]);
  });

  it('X-RAY and FOCUS auto-solves never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'scan')).toBe(true);
    expect(await power(api, 'hint')).toBe(true);
    expect(api.calls.miss).toEqual([]);
    expect(api.recorded).toEqual([]);
  });
});
