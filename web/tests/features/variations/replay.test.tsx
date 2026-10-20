// Replay vs first play through the real GameScreen + Fact or Fib (scenario-variations.md):
// first play is always v3 with no request; a replay after the clear shows NOVA thinking, then a
// "NEW CASE FILE" with different lines, recorded as seen (survives a reload); replay again →
// a different one; backend down / timeout / everything seen → v3 classic + in-world note.
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { SCENARIO_TIMEOUT_MS } from '@/contracts/api';
import { STATE_STORAGE_KEY, type PersistedState } from '@/contracts/state';
import { CASE_FILE, setCaseFileClientForTests } from '@/features/variations';
import { SENTENCES } from '@/games/m1g2/data';
import { GameScreen } from '@/screens/GameScreen';
import { GAME } from '@/screens/copy';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { hydrateStore, resetHydrationForTests, resetStoreForTests, useGlitchStore } from '@/state/store';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { createFakeScenarioServer, type FakeScenarioServer } from './fixtures';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const NOW = new Date(2026, 9, 20, 10);
const M1G2_OPEN: Partial<PersistedState> = {
  profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() },
  steps: { m1h: true, m1s: true, m1g1: true },
  heroByModule: { 1: 'scout' },
};
const M1G2_DONE: Partial<PersistedState> = { ...M1G2_OPEN, steps: { m1h: true, m1s: true, m1g1: true, m1g2: true }, onceBonuses: { gm1g2: true } };
const VAR_LINE0 = '1. A spam filter learns from emails that people have labelled.';
const VAR2_LINE0 = '1. Once trained, a model never needs testing again.'; // the reversed second variation
const V3_LINE0 = `1. ${SENTENCES[0]?.[0]}`;

let srv: FakeScenarioServer;
let restore: () => void;
beforeEach(() => {
  jest.useFakeTimers();
  setReducedMotionOverride(true);
  srv = createFakeScenarioServer();
  restore = setCaseFileClientForTests(srv.client);
});
afterEach(() => {
  restore();
  setReducedMotionOverride(null);
  jest.useRealTimers();
});

async function open(state: Partial<PersistedState>): Promise<void> {
  await renderWithProviders(<GameScreen mod={1} gameId="m1g2" />, { state, now: NOW });
}
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}
const press = async (id: string): Promise<void> => {
  await fireEvent.press(screen.getByTestId(id));
};
const line0 = (): string => screen.getByTestId('pick-line-0').props.accessibilityLabel as string;
async function winFibs(indices: number[]): Promise<void> {
  for (const i of indices) await press(`pick-line-${i}`);
  await settle(700);
  expect(screen.getByTestId('win-screen')).toBeTruthy();
}

describe('first play', () => {
  it('is always the v3 case file: no request, no tag, no note', async () => {
    await open(M1G2_OPEN);
    await settle();
    expect(line0()).toBe(V3_LINE0);
    expect(screen.queryByTestId('case-file-tag')).toBeNull();
    expect(screen.queryByTestId('case-file-offline')).toBeNull();
    expect(screen.queryByTestId('case-file-loading')).toBeNull();
    expect(srv.requests).toHaveLength(0);
  });

  it('a fail + retry on first play stays v3 and never requests', async () => {
    await open(M1G2_OPEN);
    for (const i of [0, 2, 4]) await press(`pick-line-${i}`);
    await press('fail-retry');
    await settle();
    expect(line0()).toBe(V3_LINE0);
    expect(srv.requests).toHaveLength(0);
  });
});

describe('replay after the clear', () => {
  it('v3 win → REPLAY → NOVA thinking → NEW CASE FILE with different lines, marked seen', async () => {
    await open(M1G2_OPEN);
    await winFibs([1, 3, 5]);
    expect(srv.requests).toHaveLength(0);
    srv.mode = { kind: 'hang' };
    await press('win-replay');
    expect(screen.getByTestId('case-file-loading')).toHaveTextContent(new RegExp(CASE_FILE.fetching));
    expect(screen.getByTestId('case-file-loading')).toHaveTextContent(new RegExp(CASE_FILE.newTag));
    expect(screen.getByTestId('power-button').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByTestId('pick-line-0')).toBeNull();
    expect(srv.requests).toHaveLength(1);
  });

  it('serves the variation, tags it, records it as seen; replay again → a different one', async () => {
    await open(M1G2_OPEN);
    await winFibs([1, 3, 5]);
    await press('win-replay');
    await settle();
    expect(screen.getByTestId('case-file-tag')).toHaveTextContent(CASE_FILE.newTag);
    expect(line0()).toBe(VAR_LINE0);
    expect(line0()).not.toBe(V3_LINE0);
    expect(srv.requests.map((r) => r.seen)).toEqual([[]]);
    expect(useGlitchStore.getState().seenScenarios.m1g2).toEqual(['m1g2-v1aaaa']);

    // Variation scores against its own key (fibs 1, 3, 5) and grants no second game-clear XP.
    const xp = useGlitchStore.getState().xp;
    await winFibs([1, 3, 5]);
    expect(screen.queryByTestId('win-xp-tag')).toBeNull();
    expect(useGlitchStore.getState().xp).toBe(xp);

    await press('win-replay');
    await settle();
    expect(srv.requests.map((r) => r.seen)).toEqual([[], ['m1g2-v1aaaa']]);
    expect(line0()).toBe(VAR2_LINE0);
    expect(screen.getByTestId('case-file-tag')).toBeTruthy();
    expect(useGlitchStore.getState().seenScenarios.m1g2).toEqual(['m1g2-v1aaaa', 'm1g2-v2bbbb']);
  });

  it('opening an already-cleared game is a replay: requests on open with the stored seen list', async () => {
    await open({ ...M1G2_DONE, seenScenarios: { m1g2: ['m1g2-v1aaaa'] } });
    await settle();
    expect(srv.requests[0]?.seen).toEqual(['m1g2-v1aaaa']);
    expect(line0()).toBe(VAR2_LINE0);
  });

  it('a fail + retry on a variation keeps the same case file (no new request)', async () => {
    await open(M1G2_DONE);
    await settle();
    expect(line0()).toBe(VAR_LINE0);
    for (const i of [0, 2, 4]) await press(`pick-line-${i}`);
    expect(screen.getByTestId('fail-screen')).toBeTruthy();
    await press('fail-retry');
    await settle();
    expect(line0()).toBe(VAR_LINE0);
    expect(srv.requests).toHaveLength(1);
  });

  it('the seen list survives a reload (persisted v2 state)', async () => {
    await open(M1G2_DONE);
    await settle();
    const raw = JSON.parse((await AsyncStorage.getItem(STATE_STORAGE_KEY)) ?? '{}') as { version: number; seenScenarios: unknown };
    expect(raw.version).toBe(2);
    expect(raw.seenScenarios).toEqual({ m1g2: ['m1g2-v1aaaa'] });
    // Cold start: wipe memory (this also writes a fresh state), put the saved text back, re-read.
    const disk = await AsyncStorage.getItem(STATE_STORAGE_KEY);
    resetStoreForTests();
    resetHydrationForTests();
    await settle();
    await AsyncStorage.setItem(STATE_STORAGE_KEY, disk ?? '');
    expect(useGlitchStore.getState().seenScenarios).toEqual({});
    await hydrateStore();
    expect(useGlitchStore.getState().seenScenarios).toEqual({ m1g2: ['m1g2-v1aaaa'] });
  });
});

describe('fallback to the classic case file', () => {
  it('backend down → v3 with the in-world note; nothing recorded as seen', async () => {
    srv.mode = { kind: 'network' };
    await open(M1G2_DONE);
    await settle();
    expect(screen.getByTestId('case-file-offline')).toHaveTextContent(CASE_FILE.offlineNote);
    expect(screen.queryByTestId('case-file-tag')).toBeNull();
    expect(line0()).toBe(V3_LINE0);
    expect(useGlitchStore.getState().seenScenarios).toEqual({});
  });

  it(`no answer within ${SCENARIO_TIMEOUT_MS} ms → v3 with the note (bounded wait)`, async () => {
    srv.mode = { kind: 'hang' };
    await open(M1G2_DONE);
    await settle(SCENARIO_TIMEOUT_MS - 1);
    expect(screen.getByTestId('case-file-loading')).toBeTruthy();
    await settle(1);
    expect(screen.getByTestId('case-file-offline')).toBeTruthy();
    expect(line0()).toBe(V3_LINE0);
  });

  it('every variation seen and no energy (CAP_DEVICE) → v3 with the note', async () => {
    await open({ ...M1G2_DONE, seenScenarios: { m1g2: ['m1g2-v1aaaa', 'm1g2-v2bbbb'] } });
    await settle();
    expect(screen.getByTestId('case-file-offline')).toBeTruthy();
    expect(line0()).toBe(V3_LINE0);
    expect(useGlitchStore.getState().seenScenarios.m1g2).toEqual(['m1g2-v1aaaa', 'm1g2-v2bbbb']);
  });

  it('a non-content game (simulation) never requests even when cleared', async () => {
    await renderWithProviders(<GameScreen mod={2} gameId="m2g1" />, {
      state: { ...M1G2_DONE, steps: { m1h: true, m1s: true, m1g1: true, m1g2: true, m2h: true, m2s: true, m2g1: true } },
      now: NOW,
    });
    await settle();
    expect(srv.requests).toHaveLength(0);
    expect(screen.queryByTestId('case-file-loading')).toBeNull();
  });
});

describe('win strip', () => {
  it('no longer advertises fresh case files; Mistake recap stays a SOON stub', async () => {
    await open(M1G2_OPEN);
    await winFibs([1, 3, 5]);
    const strip = screen.getByTestId('win-soon-strip');
    expect(strip).toHaveTextContent(/COMING SOON: Mistake recap/);
    expect(strip).not.toHaveTextContent(/Fresh case files/);
    expect(GAME.soonStrip).toBe('COMING SOON: Mistake recap');
  });
});
