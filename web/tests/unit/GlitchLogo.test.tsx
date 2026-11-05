// The wordmark tears for a few stepped frames every few seconds; never under reduced motion.
import React from 'react';
import { act, screen } from '@testing-library/react-native';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { GLITCH_FRAME_MS, GLITCH_REST_MS, GlitchLogo } from '@/ui/GlitchLogo';
import { renderWithProviders } from '@/testing/renderWithProviders';

// Ghost layers are hidden from assistive tech, so counting them needs the opt-in.
const copies = (): number => screen.queryAllByText('GLITCH', { includeHiddenElements: true }).length;
const tick = async (ms: number): Promise<void> => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  setReducedMotionOverride(null);
  jest.useRealTimers();
});

describe('<GlitchLogo>', () => {
  it('rests as one word, tears into ghost layers during a burst, then rests again', async () => {
    setReducedMotionOverride(false);
    await renderWithProviders(<GlitchLogo testID="logo" />);
    expect(copies()).toBe(1);
    await tick(GLITCH_REST_MS);
    expect(copies()).toBeGreaterThan(1);
    expect(screen.getAllByText('GLITCH')).toHaveLength(1); // screen readers hear one word
    await tick(GLITCH_FRAME_MS * 6);
    expect(copies()).toBe(1);
    await tick(GLITCH_REST_MS);
    expect(copies()).toBeGreaterThan(1);
  });

  it('never tears under reduced motion', async () => {
    setReducedMotionOverride(true);
    await renderWithProviders(<GlitchLogo testID="logo" />);
    await tick(GLITCH_REST_MS * 3);
    expect(copies()).toBe(1);
    expect(screen.getByText('GLITCH')).toBeTruthy();
  });
});
