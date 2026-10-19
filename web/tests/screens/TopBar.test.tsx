// Top bar, Locked and Not-found screens, app effects (daily on start), nav helpers.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { TopBar } from '@/screens/TopBar';
import { LockedScreen } from '@/screens/LockedScreen';
import { NotFoundScreen } from '@/screens/NotFoundScreen';
import { AppEffects } from '@/screens/AppEffects';
import { goFlow } from '@/screens/nav';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { useGlitchStore } from '@/state/store';
import { renderWithProviders } from '@/testing/renderWithProviders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

beforeEach(() => {
  setReducedMotionOverride(true);
  (router.navigate as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
});
afterEach(() => setReducedMotionOverride(null));

describe('TopBar', () => {
  it('shows LVL, XP into the level, the streak and HOME / SETTINGS', async () => {
    await renderWithProviders(<TopBar />, { state: { xp: 235, streak: { current: 3, best: 3, lastPlayDay: null } } });
    expect(screen.getByTestId('xp-level')).toHaveTextContent('LVL 3');
    expect(screen.getByTestId('xp-text')).toHaveTextContent('35/100 XP');
    expect(screen.getByTestId('streak-chip')).toHaveTextContent('3');
    expect(screen.getByTestId('streak-chip').props.accessibilityLabel).toBe('Day streak 3');
    await fireEvent.press(screen.getByTestId('topbar-home'));
    expect(router.navigate).toHaveBeenLastCalledWith('/');
    await fireEvent.press(screen.getByTestId('topbar-settings'));
    expect(router.navigate).toHaveBeenLastCalledWith('/settings');
  });

  it('updates live when XP changes', async () => {
    await renderWithProviders(<TopBar />, { state: { xp: 95 } });
    expect(screen.getByTestId('xp-level')).toHaveTextContent('LVL 1');
    await act(async () => {
      useGlitchStore.getState().patch((d) => {
        d.xp = 105;
      });
    });
    expect(screen.getByTestId('xp-level')).toHaveTextContent('LVL 2');
    expect(screen.getByTestId('xp-text')).toHaveTextContent('5/100 XP');
  });
});

describe('LockedScreen / NotFoundScreen', () => {
  it('locked: message + Home', async () => {
    await renderWithProviders(<LockedScreen />);
    expect(screen.getByText('This step is locked. Finish the earlier steps first.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('locked-home'));
    expect(router.navigate).toHaveBeenCalledWith('/');
  });

  it('not found: LOST IN THE GRID + Home', async () => {
    await renderWithProviders(<NotFoundScreen />);
    expect(screen.getByText('LOST IN THE GRID')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('not-found-home'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('AppEffects', () => {
  it('runs the daily check on start once onboarded (fresh device → 10 XP, streak 1)', async () => {
    await renderWithProviders(<AppEffects />, { state: { profile: { nickname: null, onboarded: true, createdAt: new Date().toISOString() } } });
    expect(useGlitchStore.getState().xp).toBe(10);
    expect(useGlitchStore.getState().streak.current).toBe(1);
  });

  it('does nothing before onboarding', async () => {
    await renderWithProviders(<AppEffects />);
    expect(useGlitchStore.getState().xp).toBe(0);
    expect(useGlitchStore.getState().streak.lastPlayDay).toBeNull();
  });
});

describe('nav.goFlow', () => {
  it('routes a step target to its screen and a complete target to Module Complete', () => {
    goFlow({ kind: 'step', step: 'm2s' });
    expect(router.navigate).toHaveBeenLastCalledWith('/module/2/story');
    goFlow({ kind: 'complete', mod: 3 });
    expect(router.navigate).toHaveBeenLastCalledWith('/module/3/complete');
  });
});
