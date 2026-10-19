// Hero select (v3 heroSel): preselection rules, choosing a card, ▶ Enter saves the module's
// hero + last hero + heroes played, marks m<n>h done and advances; ← HOME; locked deep link.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { PersistedState } from '@/contracts/state';
import { HeroSelectScreen } from '@/screens/HeroSelectScreen';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { useGlitchStore } from '@/state/store';
import { useToastStore } from '@/ui/toast';
import { renderWithProviders } from '@/testing/renderWithProviders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const NOW = new Date(2026, 9, 20, 10);
const BASE: Partial<PersistedState> = { profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() } };
const M1_DONE = { m1h: true, m1s: true, m1g1: true, m1g2: true } as const;

beforeEach(() => {
  setReducedMotionOverride(true);
  (router.navigate as jest.Mock).mockClear();
});
afterEach(() => setReducedMotionOverride(null));

const checked = (id: string): boolean => !!screen.getByTestId(`hero-card-${id}`).props.accessibilityState?.checked;

describe('HeroSelectScreen', () => {
  it('shows the module heading, the v3 copy and four hero cards; SCOUT preselected on a fresh device', async () => {
    await renderWithProviders(<HeroSelectScreen mod={1} />, { state: BASE, now: NOW });
    expect(screen.getByText('MODULE 1 · TRAINING LAB')).toBeTruthy();
    expect(screen.getByText('CHOOSE YOUR HERO')).toBeTruthy();
    expect(screen.getByText('Each hero has one power. You get 2 uses per game.')).toBeTruthy();
    for (const id of ['scout', 'chrono', 'guard', 'oracle']) expect(screen.getByTestId(`hero-card-${id}`)).toBeTruthy();
    expect(checked('scout')).toBe(true);
    expect(screen.getByTestId('hero-card-guard').props.accessibilityLabel).toBe('GUARDIAN, SHIELD power. Blocks your next mistake. No heart lost.');
    expect(screen.getByTestId('hero-enter')).toHaveTextContent('▶ Enter the Training Lab');
  });

  it('preselects the module hero, else the last hero', async () => {
    await renderWithProviders(<HeroSelectScreen mod={2} />, { state: { ...BASE, steps: M1_DONE, lastHero: 'oracle' }, now: NOW });
    expect(checked('oracle')).toBe(true);
    await renderWithProviders(<HeroSelectScreen mod={2} />, { state: { ...BASE, steps: M1_DONE, lastHero: 'oracle', heroByModule: { 2: 'chrono' } }, now: NOW });
    expect(checked('chrono')).toBe(true);
  });

  it('Enter saves the chosen hero for the module, marks the step and goes to Storytime', async () => {
    await renderWithProviders(<HeroSelectScreen mod={1} />, { state: BASE, now: NOW });
    await fireEvent.press(screen.getByTestId('hero-card-guard'));
    expect(checked('guard')).toBe(true);
    expect(checked('scout')).toBe(false);
    await fireEvent.press(screen.getByTestId('hero-enter'));
    const s = useGlitchStore.getState();
    expect(s.heroByModule[1]).toBe('guard');
    expect(s.lastHero).toBe('guard');
    expect(s.heroesPlayed.guard).toBe(true);
    expect(s.steps.m1h).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith('/module/1/story');
  });

  it('a replayed hero select advances to the first not-done step', async () => {
    await renderWithProviders(<HeroSelectScreen mod={1} />, { state: { ...BASE, steps: { m1h: true, m1s: true } }, now: NOW });
    await fireEvent.press(screen.getByTestId('hero-enter'));
    expect(router.navigate).toHaveBeenCalledWith('/module/1/game/m1g1');
  });

  it('playing with the 4th hero unlocks Hero Collector (with its toast)', async () => {
    await renderWithProviders(<HeroSelectScreen mod={1} />, { state: { ...BASE, heroesPlayed: { scout: true, chrono: true, guard: true } }, now: NOW });
    await fireEvent.press(screen.getByTestId('hero-card-oracle'));
    await fireEvent.press(screen.getByTestId('hero-enter'));
    expect(useGlitchStore.getState().badges.heroes).toBeDefined();
    const t = useToastStore.getState();
    expect([t.current?.text, ...t.queue.map((q) => q.text)]).toContain('BADGE · HERO COLLECTOR');
  });

  it('← HOME returns home without saving', async () => {
    await renderWithProviders(<HeroSelectScreen mod={1} />, { state: BASE, now: NOW });
    await fireEvent.press(screen.getByTestId('hero-back'));
    expect(router.navigate).toHaveBeenCalledWith('/');
    expect(useGlitchStore.getState().steps.m1h).toBeUndefined();
  });

  it('a locked module shows the locked message and a Home button', async () => {
    await renderWithProviders(<HeroSelectScreen mod={2} />, { state: BASE, now: NOW });
    expect(screen.getByText('This step is locked. Finish the earlier steps first.')).toBeTruthy();
    expect(screen.queryByTestId('hero-enter')).toBeNull();
    await fireEvent.press(screen.getByTestId('locked-home'));
    expect(router.navigate).toHaveBeenCalledWith('/');
  });
});
