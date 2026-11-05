// m3g2 · Fairness Lab — Phase 3 mistake payloads (RUN AUDIT fails: gap / accuracy), X-RAY/FOCUS record nothing.
import game from '@/games/m3g2';
import { accuracyFailMessage, gapFailMessage } from '@/games/m3g2/data';
import { mount, power, press } from '../mistakeHelpers';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const audit = (answer: string, answerLabel: string) => ({
  itemId: 'audit', answer, correct: 'pass', concept: 'Algorithmic discrimination', itemText: 'THE SCREENER AUDIT', answerLabel, correctLabel: 'GAP ≤ 6 · ACCURACY ≥ 80', explain: true,
});

describe('m3g2 mistakes', () => {
  it('gap over goal → `gap`; skills switched off → `accuracy`', async () => {
    const api = await mount(game);
    await press('m3g2-audit'); // all on: gap 31
    for (const id of ['gpa', 'col', 'cap', 'brk', 'pc']) await press(`toggle-${id}`);
    await press('m3g2-audit'); // code + int: accuracy 76, gap 2
    expect(api.calls.miss).toEqual([gapFailMessage(31), accuracyFailMessage(76)]);
    expect(api.recorded.map((r) => r.mistake)).toEqual([audit('gap', 'GAP 31 · GOAL ≤ 6'), audit('accuracy', 'ACCURACY 76% · GOAL ≥ 80')]);
  });

  it('X-RAY and FOCUS never record a mistake', async () => {
    const api = await mount(game, { powerUses: 4 });
    expect(await power(api, 'scan')).toBe(true);
    expect(await power(api, 'hint')).toBe(true);
    expect(api.recorded).toEqual([]);
  });
});
