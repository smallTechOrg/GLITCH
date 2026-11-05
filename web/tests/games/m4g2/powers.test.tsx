// m4g2 · Confidence Court — per-hero powers (2 uses each), REWIND before any answer, SHIELD,
// out of hearts, and the stars / XP the frame derives from the session at win.
import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m4g2';
import { ITEMS, SUMMARY, WRONG } from '@/games/m4g2/data';
import { winGame } from '@/engine/rewards';
import { starsFor } from '@/engine/session';
import { createInitialState } from '@/state/migrate';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, type TestGameApi } from '@/testing/testGameApi';

const Game = game.Component;
const NOW = new Date('2026-10-20T10:00:00Z');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: HeroId): Promise<TestGameApi> {
  const api = createTestGameApi({ hero });
  await renderWithProviders(<Game api={api} />);
  return api;
}

async function place(item: string, zone: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(`dnd-item-${item}`));
  await fireEvent.press(screen.getByTestId(`dnd-zone-${zone}`));
}

async function power(api: TestGameApi): Promise<boolean> {
  let ok = false;
  await act(async () => {
    ok = api.usePower();
  });
  return ok;
}

async function solveRemaining(): Promise<void> {
  for (const it of ITEMS) {
    if (within(screen.getByTestId('dnd-pool')).queryByTestId(`dnd-item-${it.id}`)) await place(it.id, it.answer as string);
  }
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

const rewards = (api: TestGameApi) => winGame(createInitialState(NOW), 'm4g2', api.hearts, api.lost, NOW);

describe('m4g2 powers', () => {
  it('REWIND (CHRONO) before any answer is not consumed: toast, uses stay at 2', async () => {
    const api = await setup('chrono');
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
  });

  it('REWIND restores the heart a wrong verdict cost; 2 uses then refused', async () => {
    const api = await setup('chrono');
    await place('a5', 'trust');
    await place('a6', 'verify');
    expect(api.calls.miss).toEqual([WRONG, WRONG]);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    await place('a2', 'trust');
    expect(await power(api)).toBe(false);
    expect(api.hearts).toBe(2);
  });

  it('SHIELD (GUARDIAN) blocks one wrong drop, then the next one costs a heart', async () => {
    const api = await setup('guard');
    expect(await power(api)).toBe(true);
    await place('a3', 'trust');
    expect(api.hearts).toBe(3);
    expect(api.lastSay()).toEqual({ text: `SHIELDED! ${WRONG}`, mood: 'good' });
    await place('a3', 'trust');
    expect(api.hearts).toBe(2);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false);
  });

  it('X-RAY (SCOUT) places a1 then a2 and is refused on the 3rd press', async () => {
    const api = await setup('scout');
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false);
    expect(within(screen.getByTestId('dnd-zone-trust')).getByTestId('dnd-item-a1')).toBeTruthy();
    expect(within(screen.getByTestId('dnd-zone-verify')).getByTestId('dnd-item-a2')).toBeTruthy();
    await solveRemaining();
    expect(api.calls.win).toEqual([SUMMARY]);
  });

  it('FOCUS (ORACLE) has exactly 2 uses', async () => {
    const api = await setup('oracle');
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false);
  });
});

describe('m4g2 stars and XP at win', () => {
  it('flawless win → 3 stars, +30 GAME CLEAR, +25 FLAWLESS', async () => {
    const api = await setup('oracle');
    await solveRemaining();
    expect(api.calls.win).toEqual([SUMMARY]);
    const r = rewards(api);
    expect(r).toMatchObject({ stars: 3, gameXp: 30, flawlessXp: 25 });
  });

  it('two mistakes then a win → 1 star, game XP only', async () => {
    const api = await setup('scout');
    await place('a1', 'verify');
    await place('a4', 'verify');
    await solveRemaining();
    expect(api.calls.win).toEqual([SUMMARY]);
    expect(starsFor(api.hearts)).toBe(1);
    expect(rewards(api)).toMatchObject({ stars: 1, gameXp: 30, flawlessXp: 0 });
  });
});
