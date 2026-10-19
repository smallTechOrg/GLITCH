// Home (v3 menu): fresh device after Skip → PLAYER 1, LVL 1, 10 XP, streak 1, Module 1 open,
// 2–4 LOCKED, 0/12 badges; quest box states; step statuses; badge labels; daily on focus.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
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

const NOW = new Date();
const ONBOARDED: Partial<PersistedState> = { profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() } };
const ALL_DONE = Object.fromEntries(STEP_IDS.map((s) => [s, true])) as PersistedState['steps'];

beforeEach(() => {
  setReducedMotionOverride(true);
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

afterEach(() => resetToasts()); // no toast timer outlives a test
