// Module complete (v3 modDoneScreen): +50 XP once, tag only when awarded now, what's next,
// course complete on module 4 (no next button, Graduate badge), locked when unfinished.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { PersistedState } from '@/contracts/state';
import { STEP_IDS } from '@/contracts/ids';
import { ModuleCompleteScreen, CONFETTI_COUNT } from '@/screens/ModuleCompleteScreen';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { useGlitchStore } from '@/state/store';
import { renderWithProviders } from '@/testing/renderWithProviders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const NOW = new Date(2026, 9, 20, 10);
const BASE: Partial<PersistedState> = { profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() } };
const M1_DONE = { m1h: true, m1s: true, m1g1: true, m1g2: true } as const;
const ALL_DONE = Object.fromEntries(STEP_IDS.map((s) => [s, true])) as PersistedState['steps'];

beforeEach(() => {
  setReducedMotionOverride(true);
  (router.navigate as jest.Mock).mockClear();
});
afterEach(() => setReducedMotionOverride(null));

describe('ModuleCompleteScreen', () => {
  it('grants +50 XP once with the tag, Boot Up, title, covered tags and what is next', async () => {
    await renderWithProviders(<ModuleCompleteScreen mod={1} />, { state: { ...BASE, steps: M1_DONE, xp: 100 }, now: NOW });
    expect(screen.getByText('MODULE 1 COMPLETE')).toBeTruthy();
    expect(screen.getByTestId('complete-xp-tag')).toHaveTextContent('+50 XP');
    expect(screen.getByText('Training Lab')).toBeTruthy();
    expect(screen.getByText('You covered:')).toBeTruthy();
    expect(screen.getByText('Generalization')).toBeTruthy();
    expect(screen.getByText("WHAT'S NEXT")).toBeTruthy();
    expect(screen.getByText('Module 2 is unlocked: Prompt Forge.')).toBeTruthy();
    expect(screen.getByTestId('complete-next')).toHaveTextContent('Start Module 2 ▶');
    const s = useGlitchStore.getState();
    expect(s.xp).toBe(150);
    expect(s.onceBonuses.mod1).toBe(true);
    expect(s.badges.boot).toBeDefined();
    expect(CONFETTI_COUNT).toBe(28);
  });

  it('revisiting grants 0 XP and shows no XP tag', async () => {
    await renderWithProviders(<ModuleCompleteScreen mod={1} />, { state: { ...BASE, steps: M1_DONE, xp: 150, onceBonuses: { mod1: true } }, now: NOW });
    expect(screen.queryByTestId('complete-xp-tag')).toBeNull();
    expect(useGlitchStore.getState().xp).toBe(150);
  });

  it('Start Module n+1 opens its hero select; Home goes home', async () => {
    await renderWithProviders(<ModuleCompleteScreen mod={1} />, { state: { ...BASE, steps: M1_DONE }, now: NOW });
    await fireEvent.press(screen.getByTestId('complete-next'));
    expect(router.navigate).toHaveBeenLastCalledWith('/module/2/hero');
    await fireEvent.press(screen.getByTestId('complete-home'));
    expect(router.navigate).toHaveBeenLastCalledWith('/');
  });

  it('module 4: COURSE COMPLETE!, YOU FINISHED GLITCH copy, no next button, Graduate badge', async () => {
    await renderWithProviders(<ModuleCompleteScreen mod={4} />, { state: { ...BASE, steps: ALL_DONE }, now: NOW });
    expect(screen.getByText('COURSE COMPLETE!')).toBeTruthy();
    expect(screen.getByText('YOU FINISHED GLITCH')).toBeTruthy();
    expect(screen.getByText('You can now spot what AI gets wrong and make the call. Replay any game from the homepage to earn more stars.')).toBeTruthy();
    expect(screen.queryByTestId('complete-next')).toBeNull();
    expect(useGlitchStore.getState().badges.grad).toBeDefined();
  });

  it('an unfinished module shows the locked screen and grants nothing', async () => {
    await renderWithProviders(<ModuleCompleteScreen mod={1} />, { state: { ...BASE, steps: { m1h: true } }, now: NOW });
    expect(screen.getByTestId('locked-screen')).toBeTruthy();
    expect(useGlitchStore.getState().xp).toBe(0);
    expect(useGlitchStore.getState().onceBonuses.mod1).toBeUndefined();
  });
});
