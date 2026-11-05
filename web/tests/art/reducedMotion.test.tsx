// Reduced motion: <Scene ambient> and <Sprite> NOVA think stay on a static frame; with
// motion allowed they advance.
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Scene } from '@/art/Scene';
import { Sprite } from '@/art/Sprite';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { AMBIENT_FPS, NOVA_THINK_FPS } from '@/a11y/stepped';

/** Scene puts the testID on the Image; Sprite labels its Image (testID is on the wrapper). */
const uri = (id: string): string => {
  const el = id === 'nv' ? screen.getByLabelText('NOVA') : screen.getByTestId(id, { includeHiddenElements: true });
  return (el.props.source as { uri: string }).uri;
};

async function urisOver(id: string, stepMs: number, n: number): Promise<Set<string>> {
  const seen = new Set<string>([uri(id)]);
  for (let i = 0; i < n; i++) {
    await act(async () => {
      jest.advanceTimersByTime(stepMs);
    });
    seen.add(uri(id));
  }
  return seen;
}

describe('ambient + think animation vs reduced motion', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await act(async () => setReducedMotionOverride(null));
    jest.useRealTimers();
  });

  it('Scene ambient cycles 2 frames when motion is allowed', async () => {
    setReducedMotionOverride(false);
    await render(<Scene id="lab" ambient testID="sc" />);
    expect((await urisOver('sc', 1000 / AMBIENT_FPS, 4)).size).toBe(2);
  });

  it('Scene ambient is a single static frame under reduced motion', async () => {
    setReducedMotionOverride(true);
    await render(<Scene id="lab" ambient testID="sc" />);
    expect((await urisOver('sc', 1000 / AMBIENT_FPS, 4)).size).toBe(1);
  });

  it('NOVA think cycles 3 frames, static under reduced motion', async () => {
    setReducedMotionOverride(false);
    const r = await render(<Sprite id="n" frame="think" testID="nv" accessibilityLabel="NOVA" />);
    expect((await urisOver('nv', 1000 / NOVA_THINK_FPS, 6)).size).toBe(3);
    await r.unmount();
    setReducedMotionOverride(true);
    await render(<Sprite id="n" frame="think" testID="nv" accessibilityLabel="NOVA" />);
    expect((await urisOver('nv', 1000 / NOVA_THINK_FPS, 6)).size).toBe(1);
  });
});
