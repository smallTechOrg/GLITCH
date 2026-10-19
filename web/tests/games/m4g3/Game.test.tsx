// m4g3 · Design the Companion component: sliders (− / + and screen-reader actions), toggles,
// live metrics, SHIP IT pass/fail, 500 ms win delay, X-RAY / FOCUS, out of hearts, labels.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m4g3';
import { SUMMARY, XRAY_LINE } from '@/games/m4g3/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';

const Game = game.Component;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: HeroId = 'scout') {
  const api = createTestGameApi({ hero });
  await renderWithProviders(<Game api={api} />);
  return api;
}

async function flush(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const value = (id: string): string => String(screen.getByTestId(`slider-${id}-value`).props.children);
const toggleOn = (id: string): boolean => !!screen.getByTestId(`toggle-${id}`).props.accessibilityState?.checked;
const metric = (id: string): string => screen.getByTestId(`metric-${id}`).props.accessibilityLabel as string;

async function pressTimes(testID: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) await fireEvent.press(screen.getByTestId(testID));
}

describe('m4g3 Design the Companion', () => {
  it('renders the control panel at the v3 start: 80 / 80, safeguards OFF, wellbeing 23%', async () => {
    await setup();
    expect(screen.getByText('COMPANION CONTROL PANEL')).toBeTruthy();
    expect(screen.getByText('ENGAGEMENT PUSH')).toBeTruthy();
    expect(screen.getByText('DATA COLLECTED')).toBeTruthy();
    expect(value('en')).toBe('80');
    expect(value('da')).toBe('80');
    for (const id of ['R', 'H', 'A']) expect(toggleOn(id)).toBe(false);
    expect(metric('k1')).toBe('TIME ON APP 76%, goal ≥30, met');
    expect(metric('k2')).toBe('WELLBEING 23%, goal ≥65, not met');
    expect(metric('k3')).toBe('REAL FRIENDSHIPS 18%, goal ≥55, not met');
    expect(metric('k4')).toBe('PRIVACY RISK 74%, goal ≤35, not met');
    expect(metric('k5')).toBe('HELPFULNESS 88%, goal ≥50, met');
    expect(screen.getByText('SHIP IT ▶')).toBeTruthy();
  });

  it('SHIP IT at the start design costs a heart: "Not yet: wellbeing is too low."', async () => {
    const api = await setup();
    await fireEvent.press(screen.getByTestId('m4g3-ship'));
    expect(api.calls.miss).toEqual(['Not yet: wellbeing is too low.']);
    expect(api.hearts).toBe(2);
    expect(api.calls.win).toHaveLength(0);
  });

  it('toggles update the metrics live (R: wellbeing +12, friendships +15; H: privacy −15)', async () => {
    await setup();
    await fireEvent.press(screen.getByTestId('toggle-R'));
    expect(toggleOn('R')).toBe(true);
    expect(metric('k2')).toBe('WELLBEING 35%, goal ≥65, not met');
    expect(metric('k3')).toBe('REAL FRIENDSHIPS 33%, goal ≥55, not met');
    await fireEvent.press(screen.getByTestId('toggle-H'));
    expect(metric('k4')).toBe('PRIVACY RISK 59%, goal ≤35, not met');
    await fireEvent.press(screen.getByTestId('toggle-R'));
    expect(toggleOn('R')).toBe(false);
    expect(metric('k2')).toBe('WELLBEING 23%, goal ≥65, not met');
  });

  it('is won by hand with the − buttons and safeguards; win fires 500 ms after "Shipped."', async () => {
    const api = await setup();
    await pressTimes('slider-en-dec', 50);
    await pressTimes('slider-da-dec', 50);
    expect(value('en')).toBe('30');
    expect(value('da')).toBe('30');
    for (const id of ['R', 'H', 'A']) await fireEvent.press(screen.getByTestId(`toggle-${id}`));
    await fireEvent.press(screen.getByTestId('m4g3-ship'));
    expect(api.lastSay()).toEqual({ text: 'Shipped. You balanced every trade-off.', mood: 'good' });
    await flush(499);
    expect(api.calls.win).toHaveLength(0);
    await flush(1);
    expect(api.calls.win).toEqual([SUMMARY]);
    expect(api.hearts).toBe(3);
  });

  it('a second SHIP press while shipping does nothing (one win, one "Shipped." line)', async () => {
    const api = await setup('scout');
    await act(async () => {
      api.usePower();
    });
    await fireEvent.press(screen.getByTestId('m4g3-ship'));
    await fireEvent.press(screen.getByTestId('m4g3-ship'));
    await flush(500);
    expect(api.calls.win).toHaveLength(1);
    expect(api.calls.say.filter((s) => s.text.startsWith('Shipped.'))).toHaveLength(1);
  });

  it('+ buttons and screen-reader increment/decrement actions move the sliders, clamped to 0..100', async () => {
    await setup();
    await pressTimes('slider-en-inc', 25);
    expect(value('en')).toBe('100');
    expect(screen.getByTestId('slider-en-inc').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent(screen.getByTestId('slider-da'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(value('da')).toBe('79');
    await fireEvent(screen.getByTestId('slider-da'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(value('da')).toBe('80');
    expect(metric('k1')).toBe('TIME ON APP 90%, goal ≥30, met');
  });

  it('X-RAY (SCOUT) sets the balanced design (30, 30, all on) and it ships', async () => {
    const api = await setup('scout');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()).toEqual({ text: XRAY_LINE, mood: 'good' });
    expect(value('en')).toBe('30');
    expect(value('da')).toBe('30');
    for (const id of ['R', 'H', 'A']) expect(toggleOn(id)).toBe(true);
    expect(metric('k2')).toBe('WELLBEING 86%, goal ≥65, met');
    await fireEvent.press(screen.getByTestId('m4g3-ship'));
    await flush(500);
    expect(api.calls.win).toEqual([SUMMARY]);
  });

  it('FOCUS (ORACLE) names the first failure and is always consumed', async () => {
    const api = await setup('oracle');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()).toEqual({ text: 'FOCUS: wellbeing is too low. Try less engagement push, or turn on a safeguard.', mood: 'good' });
    await pressTimes('slider-en-dec', 50);
    await pressTimes('slider-da-dec', 50);
    for (const id of ['R', 'H', 'A']) await fireEvent.press(screen.getByTestId(`toggle-${id}`));
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()?.text).toBe('FOCUS: all targets met. Ship it!');
    expect(api.powerUses).toBe(0);
  });

  it('three failed ships → out of hearts; controls are then ignored', async () => {
    const api = await setup();
    await pressTimes('m4g3-ship', 3);
    expect(api.status).toBe('failed');
    expect(api.calls.miss).toEqual(Array(3).fill('Not yet: wellbeing is too low.'));
    await fireEvent.press(screen.getByTestId('toggle-R'));
    expect(toggleOn('R')).toBe(false);
    await pressTimes('m4g3-ship', 1);
    expect(api.calls.miss).toHaveLength(3);
  });

  it('unmounting before the 500 ms delay cancels the win', async () => {
    const api = await setup('scout');
    await act(async () => {
      api.usePower();
    });
    await fireEvent.press(screen.getByTestId('m4g3-ship'));
    screen.unmount();
    await flush(600);
    expect(api.calls.win).toHaveLength(0);
  });

  it('exposes roles and labels for screen readers', async () => {
    await setup();
    const en = screen.getByTestId('slider-en');
    expect(en.props.accessibilityRole).toBe('adjustable');
    expect(en.props.accessibilityLabel).toBe('ENGAGEMENT PUSH');
    expect(en.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 80 });
    expect(screen.getByTestId('slider-da-dec').props.accessibilityLabel).toBe('Decrease DATA COLLECTED');
    const r = screen.getByTestId('toggle-R');
    expect(r.props.accessibilityRole).toBe('switch');
    expect(r.props.accessibilityLabel).toBe('Refers teens to a trusted adult');
    expect(screen.getByTestId('toggle-A').props.accessibilityLabel).toBe('"I am an AI" reminders');
    expect(screen.getByTestId('m4g3-ship').props.accessibilityRole).toBe('button');
  });
});
