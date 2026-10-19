// m3g2 · Fairness Lab — component behaviour against the frame-exact test GameApi:
// toggles, live metrics + bars, audit pass/fail, 500 ms win, powers per hero, a11y.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m3g2';
import { PASS_LINE, WIN_SUMMARY } from '@/games/m3g2/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, SHIELDED_PREFIX } from '@/testing/testGameApi';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: HeroId = 'scout') {
  const api = createTestGameApi({ hero });
  const G = game.Component;
  await renderWithProviders(<G api={api} />);
  return api;
}

const tog = async (id: string) => {
  await fireEvent.press(screen.getByTestId(`toggle-${id}`));
};
const audit = async () => {
  await fireEvent.press(screen.getByTestId('m3g2-audit'));
};
const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};
const power = async (api: ReturnType<typeof createTestGameApi>) => {
  let r = false;
  await act(async () => {
    r = api.usePower();
  });
  return r;
};
const checked = (id: string): boolean | undefined => screen.getByTestId(`toggle-${id}`).props.accessibilityState?.checked;

describe('m3g2 definition', () => {
  it('registers as module 3 with the v3 title, goal and intro', () => {
    expect(game).toMatchObject({
      id: 'm3g2',
      module: 3,
      title: 'Fairness Lab',
      goal: 'SIMULATE · GAP ≤ 6 · ACCURACY ≥ 80',
      intro: 'Switch features on or off. Fix the gap without wrecking accuracy.',
    });
  });
});

describe('<Fairness Lab>', () => {
  it('starts with all 7 features ON, GAP 31% and ACCURACY 94%, men 48% / women 17%', async () => {
    await setup();
    expect(screen.getByText('THE SCREENER · FEATURES')).toBeTruthy();
    for (const id of ['code', 'gpa', 'int', 'col', 'cap', 'brk', 'pc']) {
      expect(checked(id)).toBe(true);
      expect(screen.getByTestId(`toggle-${id}`)).toHaveTextContent(/ON/);
    }
    expect(screen.getByTestId('metric-gap').props.accessibilityLabel).toBe('GAP 31%, goal ≤6, not met');
    expect(screen.getByTestId('metric-accuracy').props.accessibilityLabel).toBe('ACCURACY 94%, goal ≥80, met');
    expect(screen.getByTestId('m3g2-men')).toHaveTextContent(/48%/);
    expect(screen.getByTestId('m3g2-women')).toHaveTextContent(/17%/);
    expect(screen.getByTestId('m3g2-men').props.accessibilityLabel).toBe('MEN SHORTLISTED 48%');
    expect(screen.getByTestId('m3g2-women').props.accessibilityLabel).toBe('WOMEN SHORTLISTED 17%');
  });

  it('toggles are labelled switches exposing their ON/OFF state', async () => {
    await setup();
    const el = screen.getByTestId('toggle-col');
    expect(el.props.accessibilityRole).toBe('switch');
    expect(el.props.accessibilityLabel).toBe("Women's college");
    await tog('col');
    expect(checked('col')).toBe(false);
    expect(screen.getByTestId('toggle-col')).toHaveTextContent(/OFF/);
    await tog('col');
    expect(checked('col')).toBe(true);
  });

  it('switching a proxy off updates the gap, accuracy and women bar live', async () => {
    await setup();
    await tog('col');
    expect(screen.getByTestId('metric-gap').props.accessibilityLabel).toBe('GAP 21%, goal ≤6, not met');
    expect(screen.getByTestId('metric-accuracy').props.accessibilityLabel).toBe('ACCURACY 92%, goal ≥80, met');
    expect(screen.getByTestId('m3g2-women')).toHaveTextContent(/27%/);
  });

  it('auditing the start state costs a heart with the gap message', async () => {
    const api = await setup();
    await audit();
    expect(api.calls.miss).toEqual(['The gap is still 31 points. Some proxies are still switched on.']);
    expect(api.hearts).toBe(2);
  });

  it('auditing with a skill off and proxies off costs a heart with the accuracy message', async () => {
    const api = await setup();
    for (const id of ['col', 'cap', 'brk', 'pc', 'gpa']) await tog(id);
    await audit();
    expect(api.calls.miss).toEqual(['Accuracy fell to 76%. Keep the skill features on.']);
  });

  it('the unique passing set wins 500 ms after the audit with the v3 summary', async () => {
    const api = await setup();
    for (const id of ['col', 'cap', 'brk', 'pc']) await tog(id);
    expect(screen.getByTestId('metric-gap').props.accessibilityLabel).toBe('GAP 2%, goal ≤6, met');
    expect(screen.getByTestId('metric-accuracy').props.accessibilityLabel).toBe('ACCURACY 86%, goal ≥80, met');
    await audit();
    expect(api.lastSay()).toEqual({ text: PASS_LINE, mood: 'good' });
    expect(api.calls.miss).toHaveLength(0);
    await advance(499);
    expect(api.calls.win).toHaveLength(0);
    await advance(1);
    expect(api.calls.win).toEqual([WIN_SUMMARY]);
    expect(api.hearts).toBe(3);
  });

  it('after a passing audit, extra audits and toggles are ignored (no double win, no late miss)', async () => {
    const api = await setup();
    for (const id of ['col', 'cap', 'brk', 'pc']) await tog(id);
    await audit();
    await audit();
    await tog('col');
    expect(checked('col')).toBe(false);
    await audit();
    await advance(500);
    expect(api.calls.win).toHaveLength(1);
    expect(api.calls.miss).toHaveLength(0);
  });

  it('three failed audits run out of hearts; further input is ignored', async () => {
    const api = await setup();
    await audit();
    await audit();
    await audit();
    expect(api.status).toBe('failed');
    await tog('col');
    expect(checked('col')).toBe(true);
    await audit();
    expect(api.calls.miss).toHaveLength(3);
  });

  it('X-RAY (SCOUT) fixes the first wrong feature in list order and says so', async () => {
    const api = await setup('scout');
    expect(await power(api)).toBe(true);
    expect(checked('col')).toBe(false);
    expect(api.lastSay()).toEqual({ text: "X-RAY: I fixed Women's college.", mood: 'good' });
    expect(await power(api)).toBe(true);
    expect(checked('cap')).toBe(false);
    expect(api.lastSay()?.text).toBe("X-RAY: I fixed Girls' team captain.");
    expect(api.powerUses).toBe(0);
  });

  it('X-RAY with everything already correct is not consumed', async () => {
    const api = await setup('scout');
    for (const id of ['col', 'cap', 'brk', 'pc']) await tog(id);
    expect(await power(api)).toBe(false);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
    expect(api.powerUses).toBe(2);
  });

  it('X-RAY turns a switched-off skill back on', async () => {
    const api = await setup('scout');
    for (const id of ['col', 'cap', 'brk', 'pc', 'int']) await tog(id);
    expect(await power(api)).toBe(true);
    expect(checked('int')).toBe(true);
    expect(api.lastSay()?.text).toBe('X-RAY: I fixed Internship.');
  });

  it('FOCUS (ORACLE) names the first proxy still on without changing anything', async () => {
    const api = await setup('oracle');
    await tog('col');
    expect(await power(api)).toBe(true);
    expect(api.lastSay()).toEqual({ text: "FOCUS: Girls' team captain is still on, and it can stand in for gender.", mood: 'good' });
    expect(checked('cap')).toBe(true);
    expect(api.calls.miss).toHaveLength(0);
    await advance(2200);
  });

  it('FOCUS with no proxy on is not consumed', async () => {
    const api = await setup('oracle');
    for (const id of ['col', 'cap', 'brk', 'pc']) await tog(id);
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
  });

  it('SHIELD (GUARDIAN) blocks a failed audit', async () => {
    const api = await setup('guard');
    expect(await power(api)).toBe(true);
    await audit();
    expect(api.hearts).toBe(3);
    expect(api.lastSay()?.text).toBe(`${SHIELDED_PREFIX}The gap is still 31 points. Some proxies are still switched on.`);
    await audit();
    expect(api.hearts).toBe(2);
  });

  it('REWIND (CHRONO) restores a heart lost to a failed audit', async () => {
    const api = await setup('chrono');
    await audit();
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(1);
  });

  it('the audit button is a labelled button', async () => {
    await setup();
    const b = screen.getByTestId('m3g2-audit');
    expect(b.props.accessibilityRole).toBe('button');
    expect(b).toHaveTextContent(/RUN AUDIT ▶/);
    expect(b.props.accessibilityLabel).toBe('RUN AUDIT');
  });
});
