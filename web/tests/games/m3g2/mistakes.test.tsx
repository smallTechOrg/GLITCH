// m3g2 · Fairness Lab — Phase 3 mistake payloads (RUN AUDIT fails, wrong decision), X-RAY/FOCUS record nothing.
import game from '@/games/m3g2';
import { CASES, DECISION_WRONG, accuracyFailMessage, gapFailMessage, type FairnessCase } from '@/games/m3g2/data';
import { mount, power, press } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const audit = (answer: string, answerLabel: string) => ({
  itemId: 'audit', answer, correct: 'pass', concept: 'Algorithmic discrimination', itemText: 'THE SCREENER AUDIT', answerLabel, correctLabel: 'GAP ≤ 6 · ACCURACY ≥ 80', explain: true,
});

describe('m3g2 mistakes', () => {
  it('skills off → `accuracy`; proxies on → `gap`', async () => {
    const api = await mount(game);
    await press('m3g2-audit'); // all off: accuracy 50, gap 2
    for (const id of ['code', 'gpa', 'int', 'col', 'cap', 'brk', 'pc']) await press(`toggle-${id}`);
    await press('m3g2-audit'); // all on: gap 31
    expect(api.calls.miss).toEqual([accuracyFailMessage(50), gapFailMessage(31)]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([audit('accuracy', 'ACCURACY 50% · GOAL ≥ 80'), audit('gap', 'GAP 31 · GOAL ≤ 6')]);
  });

  it('a wrong decision → option payload with explain: false', async () => {
    const api = await mount(game);
    for (const id of ['code', 'gpa', 'int']) await press(`toggle-${id}`);
    await press('m3g2-audit');
    const c = CASES[0] as FairnessCase;
    const wrong = c.options.find((o) => !o.right)!;
    await press(`m3g2-option-${wrong.id}`);
    expect(api.calls.miss).toEqual([DECISION_WRONG]);
    expect(api.recorded[0]?.mistake).toMatchObject({ itemId: 'decide-hiring', answer: wrong.id, correct: 'b', explain: false });
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'scan')).toBe(true);
    expect(await power(api, 'hint')).toBe(true);
    expect(api.recorded).toEqual([]);
  });
});
