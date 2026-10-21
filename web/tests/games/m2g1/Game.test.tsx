// m2g1 · Tune the Sorter — component: sliders (buttons + screen-reader actions), LOCK IT IN,
// round flow (500 ms), heart loss, powers (X-RAY / FOCUS / REWIND / SHIELD), labels.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import game from '@/games/m2g1';
import { TuneTheSorterGame } from '@/games/m2g1/Game';
import { FOCUS_ALL_MET_LINE, NEXT_DELAY_MS, ROUND_1, ROUND_2, ROUND_CLEAR_LINE, WIN_SUMMARY, XRAY_LINE } from '@/games/m2g1/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import type { HeroId } from '@/contracts/ids';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(opts: { hero?: HeroId; hearts?: number; shield?: boolean } = {}) {
  const api = createTestGameApi(opts);
  await renderWithProviders(<TuneTheSorterGame api={api} />);
  return api;
}

const value = (id: string): string => String(screen.getByTestId(`slider-${id}`).props.accessibilityValue.now);

async function press(id: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await fireEvent.press(screen.getByTestId(id));
}

async function srAction(id: string, actionName: 'increment' | 'decrement', times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await fireEvent(screen.getByTestId(`slider-${id}`), 'accessibilityAction', { nativeEvent: { actionName } });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('<TuneTheSorterGame>', () => {
  it('is the registered m2g1 component', () => {
    expect(game.Component).toBe(TuneTheSorterGame);
  });

  it('renders round 1 with v3 copy, 8 rows, sliders at (50, 30) and the metrics', async () => {
    await setup();
    expect(screen.getByTestId('m2g1-round-title')).toHaveTextContent('ROUND 1 · EMERGENCY INBOX');
    expect(screen.getByText(ROUND_1.rule)).toBeTruthy();
    for (let i = 0; i < 8; i++) expect(screen.getByTestId(`m2g1-row-${i}`)).toBeTruthy();
    expect(value('th')).toBe('50');
    expect(value('wc')).toBe('30');
    expect(screen.getByTestId('slider-th-value')).toHaveTextContent('50');
    expect(screen.getByTestId('metric-a').props.accessibilityLabel).toBe('EMERGENCIES MISSED 0, goal at most 0, met');
    expect(screen.getByTestId('metric-b').props.accessibilityLabel).toBe('FALSE ALARMS 1, goal at most 1, met');
    expect(screen.getByTestId('m2g1-lock')).toHaveTextContent('LOCK IT IN ▶');
  });

  it('exposes screen-reader labels: adjustable sliders, rows with verdicts and WRONG tags', async () => {
    await setup();
    const th = screen.getByTestId('slider-th');
    expect(th.props.accessibilityRole).toBe('adjustable');
    expect(th.props.accessibilityLabel).toBe('THRESHOLD');
    expect(th.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
    expect(screen.getByTestId('slider-wc').props.accessibilityValue).toEqual({ min: 0, max: 40, now: 30 });
    expect(screen.getByTestId('slider-th-inc').props.accessibilityLabel).toBe('Increase THRESHOLD');
    expect(screen.getByTestId('m2g1-row-0').props.accessibilityLabel).toBe('Mum: come home NOW!: score 60, URGENT');
    expect(screen.getByTestId('m2g1-row-7').props.accessibilityLabel).toBe('WIN PHONE deadline today!!!: score 70, URGENT, WRONG');
    expect(screen.getByTestId('m2g1-verdict-5')).toHaveTextContent('WAIT');
  });

  it('the + / − buttons move the threshold and the rows/metrics update live', async () => {
    await setup();
    await press('slider-th-inc', 11); // 61 → emergencies at 60 now WAIT
    expect(value('th')).toBe('61');
    expect(screen.getByTestId('m2g1-verdict-0')).toHaveTextContent('WAIT');
    expect(screen.getByTestId('metric-a').props.accessibilityLabel).toBe('EMERGENCIES MISSED 4, goal at most 0, not met');
    await press('slider-th-dec', 11);
    expect(value('th')).toBe('50');
    expect(screen.getByTestId('metric-a-value')).toHaveTextContent('0');
  });

  it('screen-reader increment/decrement actions step each slider; caps clamps at 40', async () => {
    await setup();
    await srAction('wc', 'increment', 15);
    expect(value('wc')).toBe('40');
    expect(screen.getByTestId('slider-wc-inc').props.accessibilityState).toMatchObject({ disabled: true });
    await srAction('wc', 'decrement', 40);
    expect(value('wc')).toBe('0');
    await srAction('th', 'decrement', 3);
    expect(value('th')).toBe('47');
  });

  it('LOCK IT IN at the start (parity quirk) clears round 1, then round 2 starts after 500 ms with sliders reset', async () => {
    const api = await setup();
    await press('slider-th-inc', 5); // 55 = R1 solution, still passes
    await press('m2g1-lock');
    expect(api.lastSay()).toEqual({ text: ROUND_CLEAR_LINE, mood: 'good' });
    expect(screen.getByTestId('m2g1-lock').props.accessibilityState).toMatchObject({ disabled: true });
    await advance(NEXT_DELAY_MS - 1);
    expect(screen.getByTestId('m2g1-round-title')).toHaveTextContent(/^ROUND 1 /);
    await advance(1);
    expect(screen.getByTestId('m2g1-round-title')).toHaveTextContent('ROUND 2 · SPAM FOLDER');
    expect(value('th')).toBe('50');
    expect(value('wc')).toBe('30');
    expect(screen.getByTestId('metric-a').props.accessibilityLabel).toMatch(/^SPAM LEAKED 0/);
    expect(screen.getByTestId('m2g1-verdict-0')).toHaveTextContent('BLOCKED');
    expect(api.calls.miss).toHaveLength(0);
  });

  it('passing round 2 wins 500 ms later with the v3 summary and 3 hearts', async () => {
    const api = await setup();
    await press('m2g1-lock');
    await advance(NEXT_DELAY_MS);
    await press('m2g1-lock');
    expect(api.calls.win).toHaveLength(0);
    await advance(NEXT_DELAY_MS);
    expect(api.calls.win).toEqual([WIN_SUMMARY]);
    expect(api.hearts).toBe(3);
    expect(api.status).toBe('won');
  });

  it('a double press of LOCK during the 500 ms hand-off does nothing extra', async () => {
    const api = await setup();
    await press('m2g1-lock');
    await press('m2g1-lock');
    expect(api.calls.say.filter((s) => s.text === ROUND_CLEAR_LINE)).toHaveLength(1);
    await advance(NEXT_DELAY_MS);
    expect(screen.getByTestId('m2g1-round-title')).toHaveTextContent(/^ROUND 2 /);
  });

  it('a failing lock costs a heart with the round message; three fails → out of hearts and input ignored', async () => {
    const api = await setup();
    await press('slider-th-inc', 11); // t = 61
    await press('m2g1-lock');
    expect(api.calls.miss).toEqual(['A real emergency was missed. Lower the threshold.']);
    expect(api.hearts).toBe(2);
    await press('m2g1-lock');
    await press('m2g1-lock');
    expect(api.hearts).toBe(0);
    expect(api.status).toBe('failed');
    await press('m2g1-lock');
    expect(api.calls.miss).toHaveLength(3);
    await press('slider-th-dec');
    expect(value('th')).toBe('61');
  });

  it('round 2 false-alarm failure uses fb', async () => {
    const api = await setup();
    await press('m2g1-lock');
    await advance(NEXT_DELAY_MS);
    await srAction('wc', 'increment', 10); // caps 40 → PE kit scores 50 → blocked real mail
    await press('m2g1-lock');
    expect(api.calls.miss).toEqual([ROUND_2.fb]);
  });

  it('SHIELD blocks the heart loss of a failed lock', async () => {
    const api = await setup({ hero: 'guard' });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    await press('slider-th-inc', 11);
    await press('m2g1-lock');
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(0);
    expect(api.lastSay()?.text).toBe('SHIELDED! A real emergency was missed. Lower the threshold.');
  });

  it('REWIND restores a heart after a failed lock and is not consumed at 3 hearts', async () => {
    const api = await setup({ hero: 'chrono' });
    await act(async () => {
      expect(api.usePower()).toBe(false);
    });
    expect(api.calls.toast).toEqual(['NOTHING TO USE IT ON YET']);
    await press('slider-th-inc', 11);
    await press('m2g1-lock');
    expect(api.hearts).toBe(2);
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.hearts).toBe(3);
    expect(api.powerUses).toBe(1);
  });

  it('X-RAY sets the sliders to the round solution and is always consumed', async () => {
    const api = await setup({ hero: 'scout' });
    await press('slider-th-dec', 50); // t = 0
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(value('th')).toBe('55');
    expect(value('wc')).toBe('30');
    expect(api.lastSay()).toEqual({ text: XRAY_LINE, mood: 'good' });
    await press('m2g1-lock');
    await advance(NEXT_DELAY_MS);
    // Round 2 registers its own handlers: the solution is (47, 30).
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(value('th')).toBe('47');
    expect(api.powerUses).toBe(0);
  });

  it('FOCUS names the failing goal, or says both goals are met (always consumed)', async () => {
    const api = await setup({ hero: 'oracle' });
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()).toEqual({ text: FOCUS_ALL_MET_LINE, mood: 'good' });
    await press('slider-th-inc', 11);
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()?.text).toBe('FOCUS: A real emergency was missed. Lower the threshold.');
    expect(api.powerUses).toBe(0);
  });

  it('FOCUS reports false alarms when only B is over its goal', async () => {
    const api = await setup({ hero: 'oracle' });
    await press('slider-th-dec', 50);
    await act(async () => {
      api.usePower();
    });
    expect(api.lastSay()?.text).toBe('FOCUS: Too many false alarms. Raise the threshold a little.');
  });
});
