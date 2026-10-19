// m4g3 · Design the Companion — per-hero powers (2 uses each), REWIND before any answer,
// SHIELD on a failed ship, and the stars / XP the frame derives from the session at win.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m4g3';
import { SUMMARY, XRAY_LINE } from '@/games/m4g3/data';
import { winGame } from '@/engine/rewards';
import { createInitialState } from '@/state/migrate';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, type TestGameApi } from '@/testing/testGameApi';

const Game = game.Component;
const NOW = new Date('2026-10-20T10:00:00Z');
const NOT_YET = 'Not yet: wellbeing is too low.';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: HeroId): Promise<TestGameApi> {
  const api = createTestGameApi({ hero });
  await renderWithProviders(<Game api={api} />);
  return api;
}

async function power(api: TestGameApi): Promise<boolean> {
  let ok = false;
  await act(async () => {
    ok = api.usePower();
  });
  return ok;
}

async function ship(): Promise<void> {
  await fireEvent.press(screen.getByTestId('m4g3-ship'));
}

/** Hand-solve: Home-equivalent via 50 − presses each, all safeguards on, ship, wait 500 ms. */
async function solveByHand(): Promise<void> {
  for (let i = 0; i < 50; i++) await fireEvent.press(screen.getByTestId('slider-en-dec'));
  for (let i = 0; i < 50; i++) await fireEvent.press(screen.getByTestId('slider-da-dec'));
  for (const id of ['R', 'H', 'A']) await fireEvent.press(screen.getByTestId(`toggle-${id}`));
  await ship();
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
}

const rewards = (api: TestGameApi) => winGame(createInitialState(NOW), 'm4g3', api.hearts, api.lost, NOW);

describe('m4g3 powers', () => {
  it('REWIND (CHRONO) before any ship is not consumed: toast, uses stay at 2', async () => {
    const api = await setup('chrono');
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
  });

  it('REWIND restores hearts lost to failed ships; 2 uses then refused', async () => {
    const api = await setup('chrono');
    await ship();
    await ship();
    expect(api.hearts).toBe(1);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    await ship();
    expect(await power(api)).toBe(false);
    expect(api.hearts).toBe(2);
  });

  it('SHIELD (GUARDIAN) blocks a failed ship with "SHIELDED! Not yet: …"', async () => {
    const api = await setup('guard');
    expect(await power(api)).toBe(true);
    await ship();
    expect(api.hearts).toBe(3);
    expect(api.lastSay()).toEqual({ text: `SHIELDED! ${NOT_YET}`, mood: 'good' });
    await ship();
    expect(api.hearts).toBe(2);
  });

  it('X-RAY (SCOUT) is consumed on each press up to 2 uses', async () => {
    const api = await setup('scout');
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false);
    expect(api.calls.say.filter((s) => s.text === XRAY_LINE)).toHaveLength(2);
  });

  it('powers are refused after the companion ships and the level is clear', async () => {
    const api = await setup('oracle');
    await solveByHand();
    expect(api.status).toBe('won');
    expect(await power(api)).toBe(false);
  });
});

describe('m4g3 stars and XP at win', () => {
  it('flawless hand-solved ship → 3 stars, +30 GAME CLEAR, +25 FLAWLESS', async () => {
    const api = await setup('guard');
    await solveByHand();
    expect(api.calls.win).toEqual([SUMMARY]);
    expect(rewards(api)).toMatchObject({ stars: 3, gameXp: 30, flawlessXp: 25 });
  });

  it('one failed ship then X-RAY and ship → 2 stars, not flawless', async () => {
    const api = await setup('scout');
    await ship();
    await power(api);
    await ship();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(api.calls.win).toEqual([SUMMARY]);
    expect(rewards(api)).toMatchObject({ stars: 2, gameXp: 30, flawlessXp: 0 });
  });
});
