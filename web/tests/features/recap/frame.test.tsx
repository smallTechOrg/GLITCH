// Recap + memory on the real Game Frame with the real Train the Model game (mistake-recap.md
// success criteria): three wrong drops → three rows with the right zone label; SHIELDED tag;
// X-RAY adds no row; clean 3-heart run → "No mistakes. Clean run!". The tutor chip is
// replaced by a no-op so nothing here can reach the network.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import type { PersistedState } from '@/contracts/state';
import { GameScreen } from '@/screens/GameScreen';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { setCaseFileClientForTests } from '@/features/variations';
import { useGlitchStore } from '@/state/store';
import { renderWithProviders } from '@/testing/renderWithProviders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));
jest.mock('@/features/tutor/AskNovaWhy', () => ({ AskNovaWhy: () => null }));

const NOW = new Date(2026, 9, 20, 10);
const M1_READY: Partial<PersistedState> = {
  profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() },
  steps: { m1h: true, m1s: true },
};
const STEP1: ReadonlyArray<readonly [string, string]> = [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']];
const STEP2: ReadonlyArray<readonly [string, string]> = [['t1', 'wrong'], ['t2', 'right'], ['t3', 'right'], ['t4', 'wrong']];

let restore: () => void = () => undefined;
const fetchSpy = jest.fn();
let prevFetch: unknown;
beforeEach(() => {
  jest.useFakeTimers();
  restore = setCaseFileClientForTests({
    getNextScenario: async () => ({ ok: false, error: { code: 'NETWORK', message: 'offline (test)', retryable: true } }),
  });
  setReducedMotionOverride(true);
  prevFetch = (globalThis as { fetch?: unknown }).fetch;
  (globalThis as { fetch?: unknown }).fetch = fetchSpy;
  fetchSpy.mockClear();
});
afterEach(() => {
  setReducedMotionOverride(null);
  restore();
  (globalThis as { fetch?: unknown }).fetch = prevFetch;
  jest.useRealTimers();
});

async function open(hero: HeroId): Promise<void> {
  await renderWithProviders(<GameScreen mod={1} gameId="m1g1" />, { state: { ...M1_READY, heroByModule: { 1: hero } }, now: NOW });
}
async function place(item: string, zone: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(`dnd-item-${item}`));
  await fireEvent.press(screen.getByTestId(`dnd-zone-${zone}`));
}
async function tick(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('recap on the real Train the Model frame', () => {
  it('three wrong drops (three different emails) → fail screen with three rows, each showing the right zone label', async () => {
    await open('scout');
    await place('e1', 'ok');
    await tick(600);
    await place('e2', 'spam');
    await tick(600);
    await place('e3', 'ok');
    await tick(600);
    expect(screen.getByTestId('fail-screen')).toBeTruthy();
    expect(screen.getByTestId('recap')).toHaveTextContent(/MISTAKE RECAP/);
    expect(screen.getByTestId('recap-said-0')).toHaveTextContent('YOU SAID: NOT SPAM');
    expect(screen.getByTestId('recap-was-0')).toHaveTextContent('IT WAS: SPAM');
    expect(screen.getByTestId('recap-said-1')).toHaveTextContent('YOU SAID: SPAM');
    expect(screen.getByTestId('recap-was-1')).toHaveTextContent('IT WAS: NOT SPAM');
    expect(screen.getByTestId('recap-was-2')).toHaveTextContent('IT WAS: SPAM');
    expect(screen.getByTestId('recap-item-0')).toHaveTextContent('WIN a FREE prize!!! Click now');
    expect(screen.getByTestId('recap-why-0')).toHaveTextContent(/Look at the features/);
    expect(screen.queryByTestId('recap-row-3')).toBeNull();
    expect(screen.queryByTestId('recap-clean')).toBeNull();
    // memory: every miss saved as it happened (a failed run still counts)
    expect(useGlitchStore.getState().mistakes.map((r) => r.itemId)).toEqual(['e3', 'e2', 'e1']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Retry starts a new session with an empty recap', async () => {
    await open('scout');
    for (const [i, z] of [['e1', 'ok'], ['e2', 'spam'], ['e3', 'ok']] as const) {
      await place(i, z);
      await tick(600);
    }
    await fireEvent.press(screen.getByTestId('fail-retry'));
    await tick(600);
    expect(screen.queryByTestId('fail-screen')).toBeNull();
    for (const [i, z] of STEP1) await place(i, z);
    await tick(400);
    for (const [i, z] of STEP2) await place(i, z);
    await tick(400);
    await fireEvent.press(screen.getByTestId('m1g1-finish'));
    await tick(600);
    expect(screen.getByTestId('win-screen')).toBeTruthy();
    expect(screen.getByTestId('recap-clean')).toHaveTextContent('No mistakes. Clean run!');
  });

  it('a shielded mistake shows the SHIELDED tag', async () => {
    await open('guard');
    await fireEvent.press(screen.getByTestId('power-button'));
    await tick(100);
    await place('e1', 'ok'); // absorbed by the shield
    await tick(600);
    for (const [i, z] of [['e2', 'spam'], ['e3', 'ok'], ['e4', 'spam']] as const) {
      await place(i, z);
      await tick(600);
    }
    expect(screen.getByTestId('fail-screen')).toBeTruthy();
    expect(screen.getByTestId('recap-shielded-0')).toHaveTextContent('SHIELDED');
    expect(screen.queryByTestId('recap-shielded-1')).toBeNull();
    expect(useGlitchStore.getState().mistakes.map((r) => r.shielded)).toEqual([false, false, false, true]);
  });

  it('an X-RAY solve adds no row', async () => {
    await open('scout');
    await fireEvent.press(screen.getByTestId('power-button'));
    await tick(600);
    const rest = STEP1.filter(([i]) => screen.queryByTestId(`dnd-item-${i}`) && !String(screen.getByTestId(`dnd-item-${i}`).props.accessibilityLabel).includes('placed'));
    expect(rest.length).toBeLessThan(STEP1.length);
    const wrong = rest.slice(0, 3).map(([i, z]) => [i, z === 'spam' ? 'ok' : 'spam'] as const);
    for (const [i, z] of wrong) {
      await place(i, z);
      await tick(600);
    }
    expect(screen.getByTestId('fail-screen')).toBeTruthy();
    expect(screen.getByTestId('recap-row-2')).toBeTruthy();
    expect(screen.queryByTestId('recap-row-3')).toBeNull();
    expect(useGlitchStore.getState().mistakes).toHaveLength(3);
  });

  it('a clean 3-heart run shows "No mistakes. Clean run!" and a 3-star win clears m1g1 concepts from memory', async () => {
    await renderWithProviders(<GameScreen mod={1} gameId="m1g1" />, {
      state: {
        ...M1_READY, heroByModule: { 1: 'scout' },
        mistakes: [
          { gameId: 'm1g1', variationId: 'v3', itemId: 't1', answer: 'right', concept: 'Generalization', shielded: false, at: '2026-10-19T10:00:00.000Z' },
          { gameId: 'm3g1', variationId: 'v3', itemId: 'l1', answer: 'ok', concept: 'Proxy variables', shielded: false, at: '2026-10-19T09:00:00.000Z' },
        ],
      },
      now: NOW,
    });
    for (const [i, z] of STEP1) await place(i, z);
    await tick(400);
    for (const [i, z] of STEP2) await place(i, z);
    await tick(400);
    await fireEvent.press(screen.getByTestId('m1g1-finish'));
    await tick(600);
    expect(screen.getByTestId('win-screen')).toBeTruthy();
    expect(screen.getByTestId('recap-clean')).toHaveTextContent('No mistakes. Clean run!');
    expect(screen.queryByTestId('recap-row-0')).toBeNull();
    expect(useGlitchStore.getState().mistakes.map((r) => r.concept)).toEqual(['Proxy variables']);
  });
});
