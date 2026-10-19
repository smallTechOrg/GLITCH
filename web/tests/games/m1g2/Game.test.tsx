// m1g2 · Fact or Fib — component tests against createTestGameApi (frame semantics).
// Lines are role=button Pressables, so Enter/Space (keyboard) and tap share onPress.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import { FactOrFib } from '@/games/m1g2/Game';
import { FOCUS_LINE, TRUE_MISS, WIN_SUMMARY } from '@/games/m1g2/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, type TestGameApi } from '@/testing/testGameApi';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(opts: { hero?: HeroId; hearts?: number } = {}): Promise<TestGameApi> {
  const api = createTestGameApi(opts);
  await renderWithProviders(<FactOrFib api={api} />);
  return api;
}

const line = (i: number) => screen.getByTestId(`pick-line-${i}`);
const tapLine = async (i: number): Promise<void> => {
  await fireEvent.press(line(i));
};
async function tick(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}
async function power(api: TestGameApi): Promise<boolean> {
  let r = false;
  await act(async () => {
    r = api.usePower();
  });
  return r;
}

describe('<FactOrFib>', () => {
  it("renders NOVA's draft essay with six numbered, labelled lines and FIBS FOUND: 0/3", async () => {
    await setup();
    expect(screen.getByText('NOVA · DRAFT ESSAY')).toBeTruthy();
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 0/3');
    for (let i = 0; i < 6; i++) expect(line(i).props.accessibilityRole).toBe('button');
    expect(line(0).props.accessibilityLabel).toBe('1. Machine learning finds patterns in training data.');
    expect(line(5).props.accessibilityLabel).toBe('6. Testing data is the same data the model trained on.');
    expect(screen.queryByTestId('pick-line-6')).toBeNull();
  });

  it('tapping a fib tags it FIB with its explanation, counts it and says "Fib caught! …"', async () => {
    const api = await setup();
    await tapLine(1);
    expect(line(1)).toHaveTextContent(/FIB/);
    expect(line(1)).toHaveTextContent(/Memorizing is not generalizing. New data is the real test./);
    expect(line(1).props.accessibilityLabel).toMatch(/, FIB$/);
    expect(line(1).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 1/3');
    expect(api.lastSay()).toEqual({ text: 'Fib caught! Memorizing is not generalizing. New data is the real test.', mood: 'good' });
    expect(api.hearts).toBe(3);
  });

  it('tapping a true line tags it TRUE, disables it and costs a heart with the v3 message', async () => {
    const api = await setup();
    await tapLine(0);
    expect(line(0)).toHaveTextContent(/TRUE/);
    expect(line(0).props.accessibilityLabel).toMatch(/, TRUE$/);
    expect(line(0).props.accessibilityState).toMatchObject({ disabled: true });
    expect(api.calls.miss).toEqual([TRUE_MISS]);
    expect(api.hearts).toBe(2);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 0/3');
  });

  it('a marked line ignores further taps (no double count, no double heart loss)', async () => {
    const api = await setup();
    await tapLine(0);
    await tapLine(0);
    await tapLine(3);
    await tapLine(3);
    expect(api.calls.miss).toHaveLength(1);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 1/3');
  });

  it('wins with the v3 summary exactly 700 ms after the third fib', async () => {
    const api = await setup();
    await tapLine(1);
    await tapLine(3);
    await tapLine(5);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 3/3');
    await tick(699);
    expect(api.calls.win).toHaveLength(0);
    await tick(1);
    expect(api.calls.win).toEqual([WIN_SUMMARY]);
    expect(api.status).toBe('won');
    expect(api.lost).toBe(0); // flawless, 3 stars
  });

  it('a win after two mistakes leaves 1 heart (frame → 1 star)', async () => {
    const api = await setup();
    await tapLine(0);
    await tapLine(2);
    await tapLine(1);
    await tapLine(3);
    await tapLine(5);
    await tick(700);
    expect(api.status).toBe('won');
    expect(api.hearts).toBe(1);
  });

  it('three true taps run out of hearts; the remaining lines are then ignored and no win fires', async () => {
    const api = await setup();
    await tapLine(0);
    await tapLine(2);
    await tapLine(4);
    expect(api.status).toBe('failed');
    await tapLine(1);
    await tapLine(3);
    await tapLine(5);
    await tick(1000);
    expect(api.calls.win).toHaveLength(0);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 0/3');
  });

  it('X-RAY (SCOUT) catches the next fib, and the third catch by X-RAY still wins after 700 ms', async () => {
    const api = await setup({ hero: 'scout' });
    expect(await power(api)).toBe(true);
    expect(line(1)).toHaveTextContent(/FIB/);
    expect(api.lastSay()?.text).toBe('Fib caught! Memorizing is not generalizing. New data is the real test.');
    await tapLine(3);
    expect(await power(api)).toBe(true);
    expect(line(5)).toHaveTextContent(/FIB/);
    await tick(700);
    expect(api.calls.win).toEqual([WIN_SUMMARY]);
    expect(api.powerUses).toBe(0);
  });

  it('X-RAY with no fibs left is not consumed', async () => {
    const api = await setup({ hero: 'scout' });
    await tapLine(1);
    await tapLine(3);
    await tapLine(5);
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
  });

  it('FOCUS (ORACLE) marks the next true line TRUE with no heart cost', async () => {
    const api = await setup({ hero: 'oracle' });
    expect(await power(api)).toBe(true);
    expect(line(0)).toHaveTextContent(/TRUE/);
    expect(api.lastSay()).toEqual({ text: FOCUS_LINE, mood: 'good' });
    expect(api.hearts).toBe(3);
    expect(api.calls.miss).toHaveLength(0);
    expect(await power(api)).toBe(true);
    expect(line(2)).toHaveTextContent(/TRUE/);
    expect(api.powerUses).toBe(0);
  });

  it('FOCUS skips true lines already tapped and is not consumed when none are left', async () => {
    const api = await setup({ hero: 'oracle', hearts: 3 });
    await tapLine(0);
    await tapLine(2);
    expect(await power(api)).toBe(true);
    expect(line(4)).toHaveTextContent(/TRUE/);
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(1);
  });

  it('SHIELD (GUARDIAN) blocks one true tap: hearts stay 3 and the bubble starts SHIELDED!', async () => {
    const api = await setup({ hero: 'guard' });
    expect(await power(api)).toBe(true);
    await tapLine(0);
    expect(api.hearts).toBe(3);
    expect(api.lastSay()).toEqual({ text: `SHIELDED! ${TRUE_MISS}`, mood: 'good' });
    await tapLine(2);
    expect(api.hearts).toBe(2);
  });

  it('REWIND (CHRONO) restores a heart after a true tap; the TRUE mark stays', async () => {
    const api = await setup({ hero: 'chrono' });
    await tapLine(0);
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(1);
    expect(line(0)).toHaveTextContent(/TRUE/);
  });
});
