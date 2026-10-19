// Welcome / nickname (replaces v3 login): banner copy, optional nickname (trimmed, ≤20),
// Start and Skip both mark the device onboarded and open Home.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { WelcomeScreen } from '@/screens/WelcomeScreen';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { useGlitchStore } from '@/state/store';
import { renderWithProviders } from '@/testing/renderWithProviders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

beforeEach(() => {
  setReducedMotionOverride(true);
  (router.replace as jest.Mock).mockClear();
});
afterEach(() => setReducedMotionOverride(null));

describe('WelcomeScreen', () => {
  it('shows the v3 title banner, tagline, nickname field and footer', async () => {
    await renderWithProviders(<WelcomeScreen />);
    expect(screen.getByText('GLITCH')).toBeTruthy();
    expect(screen.getByText('AN AI LITERACY ADVENTURE')).toBeTruthy();
    expect(screen.getByText('Spot what AI gets wrong. Pick a hero. Win the game.')).toBeTruthy();
    expect(screen.getByTestId('welcome-nickname-input').props.maxLength).toBe(20);
    expect(screen.getByText('Saved on this device only. No account needed.')).toBeTruthy();
    expect(screen.getByTestId('welcome-start')).toHaveTextContent('▶ Start playing');
    expect(screen.getByTestId('welcome-skip')).toHaveTextContent('Skip');
  });

  it('Start saves the trimmed nickname, marks onboarded and opens Home', async () => {
    await renderWithProviders(<WelcomeScreen />);
    await fireEvent.changeText(screen.getByTestId('welcome-nickname-input'), '  Neo  ');
    await fireEvent.press(screen.getByTestId('welcome-start'));
    const s = useGlitchStore.getState();
    expect(s.profile.nickname).toBe('Neo');
    expect(s.profile.onboarded).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('Start with an empty field behaves like Skip (no nickname)', async () => {
    await renderWithProviders(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('welcome-start'));
    expect(useGlitchStore.getState().profile.nickname).toBeNull();
    expect(useGlitchStore.getState().profile.onboarded).toBe(true);
  });

  it('Skip ignores anything typed and opens Home', async () => {
    await renderWithProviders(<WelcomeScreen />);
    await fireEvent.changeText(screen.getByTestId('welcome-nickname-input'), 'Trinity');
    await fireEvent.press(screen.getByTestId('welcome-skip'));
    expect(useGlitchStore.getState().profile.nickname).toBeNull();
    expect(useGlitchStore.getState().profile.onboarded).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
