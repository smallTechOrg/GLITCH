// m4g1 · Source Detective — per-hero powers (2 uses each), REWIND before any answer, SHIELD,
// out of hearts, and the stars / XP the frame derives from the session at win.
import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m4g1';
import { ASK_MISS, ITEMS, SUMMARY, WRONG } from '@/games/m4g1/data';
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

const rewards = (api: TestGameApi) => winGame(createInitialState(NOW), 'm4g1', api.hearts, api.lost, NOW);

describe('m4g1 powers', () => {
  it('REWIND (CHRONO) before any answer is not consumed: toast, uses stay at 2', async () => {
    const api = await setup('chrono');
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
    expect(api.hearts).toBe(3);
  });

  it('REWIND twice restores two hearts; the third press has no uses left', async () => {
    const api = await setup('chrono');
    await place('c2', 'keep');
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    expect(api.calls.miss).toEqual([WRONG, ASK_MISS]);
    expect(api.hearts).toBe(1);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    expect(api.powerUses).toBe(0);
    await place('c4', 'keep');
    expect(await power(api)).toBe(false);
    expect(api.hearts).toBe(2);
  });

  it('SHIELD (GUARDIAN) blocks one wrong drop; a second SHIELD while up is not consumed', async () => {
    const api = await setup('guard');
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(1);
    await place('c2', 'keep');
    expect(api.hearts).toBe(3);
    expect(api.lastSay()).toEqual({ text: `SHIELDED! ${WRONG}`, mood: 'good' });
    expect(api.lost).toBe(0);
  });

  it('X-RAY (SCOUT) has exactly 2 uses (c1 then c2 placed), the 3rd is refused', async () => {
    const api = await setup('scout');
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false);
    const keep = within(screen.getByTestId('dnd-zone-keep'));
    expect(keep.getByTestId('dnd-item-c1')).toBeTruthy();
    expect(within(screen.getByTestId('dnd-zone-cut')).getByTestId('dnd-item-c2')).toBeTruthy();
    await solveRemaining();
    expect(api.calls.win).toEqual([SUMMARY]);
  });

  it('FOCUS (ORACLE) has exactly 2 uses', async () => {
    const api = await setup('oracle');
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(true);
    expect(await power(api)).toBe(false);
    expect(api.powersUsed).toEqual(['hint', 'hint']);
  });

  it('powers do nothing once out of hearts', async () => {
    const api = await setup('scout');
    await place('c2', 'keep');
    await place('c4', 'keep');
    await place('c1', 'cut');
    expect(api.status).toBe('failed');
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
  });
});

describe('m4g1 stars and XP at win', () => {
  it('flawless win → 3 stars, +30 GAME CLEAR, +25 FLAWLESS', async () => {
    const api = await setup('scout');
    await solveRemaining();
    const r = rewards(api);
    expect(r.stars).toBe(3);
    expect(r.gameXp).toBe(30);
    expect(r.flawlessXp).toBe(25);
  });

  it('asking NOVA then winning → 2 stars, no flawless bonus', async () => {
    const api = await setup('scout');
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    await solveRemaining();
    expect(api.calls.win).toEqual([SUMMARY]);
    expect(starsFor(api.hearts)).toBe(2);
    expect(rewards(api).flawlessXp).toBe(0);
  });

  it('a REWIND-restored heart still counts as a loss (3 stars, not flawless)', async () => {
    const api = await setup('chrono');
    await fireEvent.press(screen.getByTestId('m4g1-ask-nova'));
    await power(api);
    await solveRemaining();
    const r = rewards(api);
    expect(r.stars).toBe(3);
    expect(r.flawlessXp).toBe(0);
    expect(r.gameXp).toBe(30);
  });
});
