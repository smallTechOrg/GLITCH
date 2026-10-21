// Home (v3 menu): fresh device after Skip → PLAYER 1, LVL 1, 10 XP, streak 1, Module 1 open,
// 2–4 LOCKED, 0/12 badges; quest box states; step statuses; badge labels; daily on focus;
// AI energy meter (durable-ai-budget.md: same component as the free-write round).
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { getEnergy } from '@/api/client';
import type { ApiResult, EnergyData } from '@/contracts/api';
import { router } from 'expo-router';
import type { PersistedState } from '@/contracts/state';
import { STEP_IDS } from '@/contracts/ids';
import { HomeScreen } from '@/screens/HomeScreen';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { useGlitchStore } from '@/state/store';
import { useToastStore, resetToasts } from '@/ui/toast';
import { renderWithProviders } from '@/testing/renderWithProviders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));
// Home reads AI energy on mount; no test talks to a real server.
jest.mock('@/api/client', () => ({ getEnergy: jest.fn() }));
const mockGetEnergy = getEnergy as jest.MockedFunction<typeof getEnergy>;
const RESETS = '2026-10-21T00:00:00Z';
const energyOk = (remaining: number): ApiResult<EnergyData> => ({ ok: true, data: {}, energy: { remaining, limit: 10, resetsAt: RESETS } });
const UNREACHABLE: ApiResult<EnergyData> = { ok: false, error: { code: 'NETWORK', message: 'Failed to fetch', retryable: true } };

const NOW = new Date();
const ONBOARDED: Partial<PersistedState> = { profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() } };
const ALL_DONE = Object.fromEntries(STEP_IDS.map((s) => [s, true])) as PersistedState['steps'];

beforeEach(() => {
  setReducedMotionOverride(true);
  mockGetEnergy.mockReset();
  mockGetEnergy.mockResolvedValue(energyOk(10));
  (router.navigate as jest.Mock).mockClear();
});
afterEach(() => setReducedMotionOverride(null));

describe('HomeScreen · fresh device', () => {
  it('greets PLAYER 1 at LVL 1 with 10 XP and streak 1 (daily on focus), Module 1 open, 2–4 locked, 0/12 badges', async () => {
    await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('PLAYER 1');
    expect(screen.getByText('WELCOME BACK')).toBeTruthy();
    const s = useGlitchStore.getState();
    expect(s.xp).toBe(10);
    expect(s.streak.current).toBe(1);
    expect(screen.getByTestId('home-stat-level')).toHaveTextContent(/LVL 1/);
    expect(screen.getByTestId('home-stat-xp')).toHaveTextContent(/10/);
    expect(screen.getByTestId('home-stat-streak')).toHaveTextContent(/Day streak \(best 1\)/);
    expect(screen.getByTestId('module-status-1')).toHaveTextContent('0/4 STEPS');
    for (const n of [2, 3, 4]) expect(screen.getByTestId(`module-status-${n}`)).toHaveTextContent('LOCKED');
    expect(screen.getByText('Finish Module 1 to unlock this one.')).toBeTruthy();
    expect(screen.getByTestId('badges-count')).toHaveTextContent('BADGES · 0/12');
    expect(useToastStore.getState().current?.text).toBe('+10 XP · DAILY x1');
  });

  it('quest box says START HERE and opens Module 1 hero select', async () => {
    await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    const q = screen.getByTestId('home-quest');
    expect(q).toHaveTextContent(/START HERE/);
    expect(q).toHaveTextContent(/Module 1: Training Lab · Choose your hero/);
    expect(screen.getByTestId('home-quest-button')).toHaveTextContent('▶ Start');
    await fireEvent.press(screen.getByTestId('home-quest-button'));
    expect(router.navigate).toHaveBeenCalledWith('/module/1/hero');
  });

  it('only the first step is startable; later ones are locked', async () => {
    await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    expect(screen.getByTestId('step-m1h-status')).toHaveTextContent('START');
    expect(screen.getByTestId('step-m1s').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('step-m1s-status').props.accessibilityLabel).toBe('LOCKED');
  });

  it('every badge is greyed with its label "<Name>, locked"', async () => {
    await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    expect(screen.getByTestId('badge-boot').props.accessibilityLabel).toBe('Boot Up, locked');
    expect(screen.getByTestId('badge-boot')).toHaveTextContent(/Finish Module 1/);
  });
});

describe('HomeScreen · in progress and complete', () => {
  it('in progress: CONTINUE with the next step, game stars on done steps, nickname greeting', async () => {
    const today = NOW;
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await renderWithProviders(<HomeScreen />, {
      state: {
        ...ONBOARDED,
        profile: { nickname: 'Ada', onboarded: true, createdAt: NOW.toISOString() },
        xp: 120,
        streak: { current: 2, best: 5, lastPlayDay: day },
        steps: { m1h: true, m1s: true, m1g1: true },
        stars: { m1g1: 2 },
        badges: { eye: NOW.toISOString() },
      },
    });
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('Ada');
    expect(useGlitchStore.getState().xp).toBe(120); // same day → no daily XP
    expect(screen.getByTestId('home-quest')).toHaveTextContent(/CONTINUE/);
    expect(screen.getByTestId('home-quest')).toHaveTextContent(/Module 1: Training Lab · Fact or Fib/);
    expect(screen.getByTestId('module-status-1')).toHaveTextContent('3/4 STEPS');
    expect(screen.getByTestId('step-m1g1-status').props.accessibilityLabel).toBe('2 stars');
    expect(screen.getByTestId('step-m1h-status')).toHaveTextContent('DONE');
    expect(screen.getByTestId('step-m1g2-status')).toHaveTextContent('START');
    expect(screen.getByTestId('home-stat-level')).toHaveTextContent(/LVL 2/);
    expect(screen.getByTestId('badges-count')).toHaveTextContent('BADGES · 1/12');
    expect(screen.getByTestId('badge-eye').props.accessibilityLabel).toBe('Sharp Eye, unlocked');
    await fireEvent.press(screen.getByTestId('step-m1g1'));
    expect(router.navigate).toHaveBeenCalledWith('/module/1/game/m1g1');
  });

  it('a done game with stars missing still shows at least 1 star', async () => {
    await renderWithProviders(<HomeScreen />, { state: { ...ONBOARDED, steps: { m1h: true, m1s: true, m1g1: true } } });
    expect(screen.getByTestId('step-m1g1-status').props.accessibilityLabel).toBe('1 star');
  });

  it('all done: COURSE COMPLETE and ▶ Replay opens Module 1 storytime', async () => {
    await renderWithProviders(<HomeScreen />, { state: { ...ONBOARDED, steps: ALL_DONE } });
    expect(screen.getByTestId('home-quest')).toHaveTextContent(/COURSE COMPLETE/);
    expect(screen.getByTestId('home-quest')).toHaveTextContent(/You finished all four modules\. Replay any game to earn more stars\./);
    expect(screen.getByTestId('home-quest-button')).toHaveTextContent('▶ Replay');
    expect(screen.getByTestId('home-stat-modules')).toHaveTextContent(/4\/4/);
    await fireEvent.press(screen.getByTestId('home-quest-button'));
    expect(router.navigate).toHaveBeenCalledWith('/module/1/story');
  });
});

describe('HomeScreen · AI energy meter', () => {
  it('reachable: reads GET /v1/energy (no charge) and shows "7/10" with the label "AI energy 7 of 10"', async () => {
    mockGetEnergy.mockResolvedValue(energyOk(7));
    await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    const meter = await screen.findByLabelText('AI energy 7 of 10');
    expect(meter.props.testID).toBe('home-energy');
    expect(screen.getByTestId('home-energy')).toHaveTextContent(/AI ENERGY/);
    expect(screen.getByTestId('home-energy')).toHaveTextContent(/7\/10/);
    expect(screen.queryByTestId('fw-energy')).toBeNull(); // Home's own testID, not the round's
    expect(mockGetEnergy).toHaveBeenCalledTimes(1);
  });

  it('shows "…" while loading, then the meter', async () => {
    let resolve: (r: ApiResult<EnergyData>) => void = () => undefined;
    mockGetEnergy.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    expect(screen.getByTestId('home-energy').props.accessibilityLabel).toBe('AI energy loading');
    expect(screen.getByTestId('home-energy')).toHaveTextContent(/…/);
    await act(async () => resolve(energyOk(3)));
    expect(screen.getByTestId('home-energy').props.accessibilityLabel).toBe('AI energy 3 of 10');
  });

  it('unreachable server: "?" state, labelled unknown, and Home stays fully usable', async () => {
    mockGetEnergy.mockResolvedValue(UNREACHABLE);
    await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    await screen.findByLabelText('AI energy unknown, NOVA is offline');
    expect(screen.getByTestId('home-energy')).toHaveTextContent(/\?/);
    expect(screen.getByTestId('home-energy')).not.toHaveTextContent(/\d+\/10/);
    await fireEvent.press(screen.getByTestId('home-quest-button'));
    expect(router.navigate).toHaveBeenCalledWith('/module/1/hero');
  });

  it('a server error envelope that still carries energy shows that energy (cap reached → 0/10, recharge time)', async () => {
    mockGetEnergy.mockResolvedValue({ ok: false, error: { code: 'CAP_DEVICE', message: 'cap', retryable: false }, energy: { remaining: 0, limit: 10, resetsAt: RESETS } });
    await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    await screen.findByLabelText('AI energy 0 of 10');
    expect(screen.getByTestId('home-energy')).toHaveTextContent(/RECHARGES IN \d+H/);
  });

  it('refreshes when the app regains focus (AppState → active), and recovers from offline', async () => {
    const listeners: Array<(s: AppStateStatus) => void> = [];
    const remove = jest.fn();
    // Swap (not spyOn): the preset's AppState.addEventListener is already a jest.fn, and
    // restoring a spy on a mock would wipe its implementation for later tests.
    const original = AppState.addEventListener;
    AppState.addEventListener = ((type: string, fn: (s: AppStateStatus) => void) => {
      if (type === 'change') listeners.push(fn);
      return { remove };
    }) as unknown as typeof AppState.addEventListener;
    try {
      mockGetEnergy.mockResolvedValueOnce(UNREACHABLE).mockResolvedValueOnce(energyOk(6));
      const view = await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
      await screen.findByLabelText('AI energy unknown, NOVA is offline');
      expect(listeners.length).toBeGreaterThan(0);
      await act(async () => listeners.forEach((fn) => fn('background')));
      expect(mockGetEnergy).toHaveBeenCalledTimes(1); // only 'active' refreshes
      await act(async () => listeners.forEach((fn) => fn('active')));
      await screen.findByLabelText('AI energy 6 of 10');
      expect(mockGetEnergy).toHaveBeenCalledTimes(2);
      await view.unmount();
      expect(remove).toHaveBeenCalled();
    } finally {
      AppState.addEventListener = original;
    }
  });

  it('a response arriving after Home unmounts is ignored (request aborted)', async () => {
    let resolve: (r: ApiResult<EnergyData>) => void = () => undefined;
    let signal: AbortSignal | undefined;
    mockGetEnergy.mockImplementation((s) => {
      signal = s;
      return new Promise((r) => (resolve = r));
    });
    const view = await renderWithProviders(<HomeScreen />, { state: ONBOARDED });
    await view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(energyOk(5))); // no state update on an unmounted tree
  });
});

afterEach(() => resetToasts()); // no toast timer outlives a test
