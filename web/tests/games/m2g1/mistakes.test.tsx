// m2g1 · Tune the Sorter — Phase 3 mistake payloads (LOCK IT IN fails: missed / false alarms,
// round 1 and round 2), X-RAY/FOCUS record nothing.
import game from '@/games/m2g1';
import { NEXT_DELAY_MS, ROUND_1, ROUND_2 } from '@/games/m2g1/data';
import { mount, power, press, tick } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const r1 = (answer: string, answerLabel: string) => ({
  itemId: 'r1', answer, correct: 'pass', concept: 'Weights and thresholds', itemText: 'ROUND 1 · EMERGENCY INBOX', answerLabel, correctLabel: 'BOTH GOALS MET', explain: true,
});

describe('m2g1 mistakes', () => {
  it('round 1: emergencies missed → `missed`; every message flagged → `false_alarms`', async () => {
    const api = await mount(game);
    await press('slider-th-inc', 11); // 61: the emergency at 60 is missed
    await press('m2g1-lock');
    await press('slider-th-dec', 21); // 40: SALE and WIN PHONE are false alarms (2 > 1)
    await press('m2g1-lock');
    expect(api.calls.miss).toEqual([ROUND_1.fa, ROUND_1.fb]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([r1('missed', 'EMERGENCIES MISSED OVER GOAL'), r1('false_alarms', 'FALSE ALARMS OVER GOAL')]);
  });

  it('round 2: real mail blocked → r2 `false_alarms`, concept Classification', async () => {
    const api = await mount(game);
    await press('m2g1-lock'); // (50, 30) passes round 1
    await tick(NEXT_DELAY_MS);
    await press('slider-th-dec', 10); // 40: the caps-only PE-kit mail is blocked (1 > 0)
    await press('m2g1-lock');
    expect(api.calls.miss).toEqual([ROUND_2.fb]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([
      { itemId: 'r2', answer: 'false_alarms', correct: 'pass', concept: 'Classification', itemText: 'ROUND 2 · SPAM FOLDER', answerLabel: 'REAL MAIL BLOCKED OVER GOAL', correctLabel: 'BOTH GOALS MET', explain: true },
    ]);
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    await press('slider-th-inc', 11);
    expect(await power(api, 'hint')).toBe(true);
    expect(await power(api, 'scan')).toBe(true);
    await press('m2g1-lock');
    expect(api.calls.miss).toEqual([]);
    expect(api.recorded).toEqual([]);
  });
});
