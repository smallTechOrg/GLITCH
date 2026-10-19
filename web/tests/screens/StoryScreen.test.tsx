// Storytime player: tap advances (first tap while typing completes the text), typing at
// 22 ms/char, instant under reduced motion, back via the keyboard map, SKIP / last slide
// finish → step m<n>s done, +10 XP once, advance to the module's next step.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { PersistedState } from '@/contracts/state';
import { STORY } from '@/content/story';
import { StoryScreen } from '@/screens/StoryScreen';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { useGlitchStore } from '@/state/store';
import { useToastStore, resetToasts } from '@/ui/toast';
import { renderWithProviders } from '@/testing/renderWithProviders';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

const NOW = new Date(2026, 9, 20, 10);
const READY: Partial<PersistedState> = {
  profile: { nickname: null, onboarded: true, createdAt: NOW.toISOString() },
  steps: { m1h: true },
  heroByModule: { 1: 'chrono' },
};

beforeEach(() => {
  (router.navigate as jest.Mock).mockClear();
});
afterEach(() => {
  setReducedMotionOverride(null);
  jest.useRealTimers();
});

const tapRoot = async () => {
  await fireEvent.press(screen.getByTestId('story-root'));
};
const progress = (): string => screen.getByTestId('story-progress').props.accessibilityLabel as string;

describe('StoryScreen (reduced motion: text appears at once)', () => {
  beforeEach(() => setReducedMotionOverride(true));

  it('starts on the title slide with progress, SKIP and the hint', async () => {
    await renderWithProviders(<StoryScreen mod={1} />, { state: READY, now: NOW });
    expect(progress()).toBe('Slide 1 of 11');
    expect(screen.getByText('TRAINING LAB')).toBeTruthy();
    expect(screen.getByTestId('story-text')).toHaveTextContent('Week one. A question on the board.');
    expect(screen.getByTestId('story-skip')).toHaveTextContent('SKIP ▶▶');
    expect(screen.getByText('TAP TO CONTINUE')).toBeTruthy(); // jest runs as a touch (native) platform
  });

  it('tap advances one slide; the speaker name and full text are shown at once', async () => {
    await renderWithProviders(<StoryScreen mod={1} />, { state: READY, now: NOW });
    await tapRoot();
    expect(progress()).toBe('Slide 2 of 11');
    expect(screen.getByText("MS. D'SOUZA")).toBeTruthy();
    expect(screen.getByTestId('story-text')).toHaveTextContent(STORY[1][1]!.x);
  });

  it('renders icons and key slides with captions and KEY IDEA', async () => {
    await renderWithProviders(<StoryScreen mod={1} />, { state: READY, now: NOW });
    for (let i = 0; i < 4; i++) await tapRoot(); // → slide 5 (icons)
    expect(progress()).toBe('Slide 5 of 11');
    expect(screen.getByText('RULES')).toBeTruthy();
    await tapRoot(); // → slide 6 (key)
    expect(screen.getByText('KEY IDEA')).toBeTruthy();
    expect(screen.getByText('Machine learning')).toBeTruthy();
  });

  it('tapping past the last slide finishes: m1s done, +10 XP "STORYTIME DONE", next step', async () => {
    await renderWithProviders(<StoryScreen mod={1} />, { state: READY, now: NOW });
    const xp0 = useGlitchStore.getState().xp;
    for (let i = 0; i < 11; i++) await tapRoot();
    const s = useGlitchStore.getState();
    expect(s.steps.m1s).toBe(true);
    expect(s.xp).toBe(xp0 + 10);
    expect(s.onceBonuses.story1).toBe(true);
    expect(useToastStore.getState().current?.text).toBe('+10 XP · STORYTIME DONE');
    expect(router.navigate).toHaveBeenCalledWith('/module/1/game/m1g1');
  });

  it('SKIP finishes at once; replaying the story later grants no XP', async () => {
    await renderWithProviders(<StoryScreen mod={1} />, { state: { ...READY, steps: { m1h: true, m1s: true }, onceBonuses: { story1: true }, xp: 40 }, now: NOW });
    await fireEvent.press(screen.getByTestId('story-skip'));
    expect(useGlitchStore.getState().xp).toBe(40);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith('/module/1/game/m1g1');
  });

  it('finishing the fourth storytime unlocks Story Fan', async () => {
    const steps = { m1h: true, m1s: true, m1g1: true, m1g2: true, m2h: true, m2s: true, m2g1: true, m2g2: true, m3h: true, m3s: true, m3g1: true, m3g2: true, m4h: true } as const;
    await renderWithProviders(<StoryScreen mod={4} />, { state: { ...READY, steps }, now: NOW });
    await fireEvent.press(screen.getByTestId('story-skip'));
    expect(useGlitchStore.getState().badges.story).toBeDefined();
    expect(router.navigate).toHaveBeenCalledWith('/module/4/game/m4g1');
  });

  it('a locked module shows the locked screen instead of the story', async () => {
    await renderWithProviders(<StoryScreen mod={3} />, { state: READY, now: NOW });
    expect(screen.getByTestId('locked-screen')).toBeTruthy();
  });

  it('deep link to storytime before the module hero is chosen shows the step-locked copy', async () => {
    await renderWithProviders(<StoryScreen mod={1} />, { state: { ...READY, steps: {} }, now: NOW });
    expect(screen.getByTestId('locked-screen')).toHaveTextContent(/This step is locked\. Finish the earlier steps first\./);
    expect(screen.queryByTestId('story-root')).toBeNull();
  });
});

describe('StoryScreen typing (motion on)', () => {
  beforeEach(() => {
    setReducedMotionOverride(false);
    jest.useFakeTimers();
  });

  it('types at 22 ms per character; the first tap completes the text, the second advances', async () => {
    await renderWithProviders(<StoryScreen mod={2} />, { state: { ...READY, steps: { m1h: true, m1s: true, m1g1: true, m1g2: true, m2h: true } }, now: NOW });
    await tapRoot(); // title → slide 2 (scene, ZARA)
    const full = STORY[2][1]!.x;
    await act(async () => {
      jest.advanceTimersByTime(22 * 5);
    });
    const partial = screen.getByTestId('story-text').props.children as string;
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(full.length);
    expect(full.startsWith(partial)).toBe(true);
    await tapRoot();
    expect(screen.getByTestId('story-text')).toHaveTextContent(full);
    expect(progress()).toBe('Slide 2 of 10');
    await tapRoot();
    expect(progress()).toBe('Slide 3 of 10');
  });

  it('finishes typing on its own after length × 22 ms', async () => {
    await renderWithProviders(<StoryScreen mod={1} />, { state: READY, now: NOW });
    await tapRoot();
    const full = STORY[1][1]!.x;
    await act(async () => {
      jest.advanceTimersByTime(22 * (full.length + 2));
    });
    expect(screen.getByTestId('story-text')).toHaveTextContent(full);
  });
});

afterEach(() => resetToasts()); // no toast timer outlives a test
