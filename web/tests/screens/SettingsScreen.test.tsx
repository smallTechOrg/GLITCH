// Settings: nickname (trimmed, ≤20, empty → PLAYER 1), READABLE FONT toggle, privacy note,
// two-tap reset that keeps streak/best/last day/nickname/settings and clears the rest.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import type { PersistedState } from '@/contracts/state';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useGlitchStore } from '@/state/store';
import { resetToasts } from '@/ui/toast';
import { renderWithProviders } from '@/testing/renderWithProviders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const NOW = new Date(2026, 9, 20, 10);
const PLAYED: Partial<PersistedState> = {
  profile: { nickname: 'Ada', onboarded: true, createdAt: NOW.toISOString() },
  settings: { readableFont: true },
  xp: 245,
  streak: { current: 4, best: 6, lastPlayDay: '2026-10-20' },
  steps: { m1h: true, m1s: true, m1g1: true },
  stars: { m1g1: 3 },
  heroByModule: { 1: 'guard' },
  lastHero: 'guard',
  heroesPlayed: { guard: true },
  powersUsed: { guard: true },
  badges: { eye: NOW.toISOString() },
  onceBonuses: { story1: true, gm1g1: true },
  promptHistory: [
    { id: 'p1', goalId: 'g1', goal: 'Goal', prompt: 'Act as a coach', levers: { task: true, context: false, role: true, format: false, limit: false }, leversHit: 2, passed: false, source: 'demo', at: NOW.toISOString() },
  ],
};

describe('SettingsScreen', () => {
  it('shows the current nickname and the privacy note', async () => {
    await renderWithProviders(<SettingsScreen />, { state: PLAYED, now: NOW });
    expect(screen.getByTestId('settings-nickname-input').props.value).toBe('Ada');
    expect(screen.getByText("Everything saves on this device. NOVA's server never keeps what you type.")).toBeTruthy();
  });

  it('saves a trimmed nickname; an empty one clears it', async () => {
    await renderWithProviders(<SettingsScreen />, { state: PLAYED, now: NOW });
    await fireEvent.changeText(screen.getByTestId('settings-nickname-input'), '  Grace  ');
    await fireEvent.press(screen.getByTestId('settings-save'));
    expect(useGlitchStore.getState().profile.nickname).toBe('Grace');
    expect(screen.getByTestId('settings-saved')).toHaveTextContent('NICKNAME SAVED');
    await fireEvent.changeText(screen.getByTestId('settings-nickname-input'), '   ');
    await fireEvent.press(screen.getByTestId('settings-save'));
    expect(useGlitchStore.getState().profile.nickname).toBeNull();
  });

  it('limits the nickname field to 20 characters', async () => {
    await renderWithProviders(<SettingsScreen />, { state: PLAYED, now: NOW });
    expect(screen.getByTestId('settings-nickname-input').props.maxLength).toBe(20);
  });

  it('READABLE FONT is a switch that toggles the setting', async () => {
    await renderWithProviders(<SettingsScreen />, { state: { ...PLAYED, settings: { readableFont: false } }, now: NOW });
    const sw = () => screen.getByTestId('settings-readable-font');
    expect(sw().props.accessibilityRole).toBe('switch');
    expect(sw().props.accessibilityState).toEqual({ checked: false });
    await fireEvent.press(sw());
    expect(useGlitchStore.getState().settings.readableFont).toBe(true);
    expect(sw().props.accessibilityState).toEqual({ checked: true });
    expect(sw()).toHaveTextContent(/ON/);
  });

  it('Reset needs a second tap; the first only asks for confirmation', async () => {
    await renderWithProviders(<SettingsScreen />, { state: PLAYED, now: NOW });
    await fireEvent.press(screen.getByTestId('settings-reset'));
    expect(screen.getByTestId('settings-reset')).toHaveTextContent('Tap again to erase XP, badges and progress');
    expect(useGlitchStore.getState().xp).toBe(245);
  });

  it('confirmed reset keeps streak, best, last day, nickname and settings; clears XP, steps, badges, prompt history', async () => {
    await renderWithProviders(<SettingsScreen />, { state: PLAYED, now: NOW });
    await fireEvent.press(screen.getByTestId('settings-reset'));
    await fireEvent.press(screen.getByTestId('settings-reset'));
    const s = useGlitchStore.getState();
    expect(s.xp).toBe(0);
    expect(s.steps).toEqual({});
    expect(s.stars).toEqual({});
    expect(s.badges).toEqual({});
    expect(s.onceBonuses).toEqual({});
    expect(s.heroByModule).toEqual({});
    expect(s.promptHistory).toEqual([]);
    expect(s.streak).toEqual({ current: 4, best: 6, lastPlayDay: '2026-10-20' });
    expect(s.profile.nickname).toBe('Ada');
    expect(s.profile.onboarded).toBe(true);
    expect(s.settings.readableFont).toBe(true);
    expect(screen.getByTestId('settings-reset-done')).toHaveTextContent('PROGRESS RESET');
    expect(screen.getByTestId('settings-reset')).toHaveTextContent('Reset progress');
  });
});

afterEach(() => resetToasts()); // no toast timer outlives a test
