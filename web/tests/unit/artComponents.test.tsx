// <Sprite>/<Scene> integration: stepped ticks reach drawCharacter/drawScene when animated,
// stay static under reduced motion, and every timer is released on unmount.
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Sprite } from '@/art/Sprite';
import { Scene } from '@/art/Scene';
import { drawCharacter } from '@/art/characters';
import { drawScene } from '@/art/scenes';
import { setReducedMotionOverride } from '@/a11y/useReducedMotion';
import { AMBIENT_FPS, NOVA_THINK_FPS } from '@/a11y/stepped';
import { clearPixelCache, pixelCacheStats } from '@/pixel/png';

jest.mock('@/art/characters', () => {
  const actual = jest.requireActual('@/art/characters');
  return { ...actual, drawCharacter: jest.fn(actual.drawCharacter) };
});
jest.mock('@/art/scenes', () => {
  const actual = jest.requireActual('@/art/scenes');
  return { ...actual, drawScene: jest.fn(actual.drawScene) };
});

const drawCharacterMock = drawCharacter as jest.MockedFunction<typeof drawCharacter>;
const drawSceneMock = drawScene as jest.MockedFunction<typeof drawScene>;

const THINK_STEP_MS = 1000 / NOVA_THINK_FPS;
const AMBIENT_STEP_MS = 1000 / AMBIENT_FPS;

/** Distinct values of argument `i` across all calls. */
const argSet = (mock: { mock: { calls: unknown[][] } }, i: number): Set<unknown> => new Set(mock.mock.calls.map((c) => c[i]));

let setIntervalSpy: jest.SpyInstance;
let clearIntervalSpy: jest.SpyInstance;

/** Interval handles created with exactly `ms` period (the stepped frame drivers). */
const intervalsAt = (ms: number): unknown[] =>
  setIntervalSpy.mock.calls.flatMap((c, i) => (c[1] === ms ? [setIntervalSpy.mock.results[i]?.value] : []));
const cleared = (): Set<unknown> => new Set(clearIntervalSpy.mock.calls.map((c) => c[0]));
const live = (ms: number): unknown[] => intervalsAt(ms).filter((h) => !cleared().has(h));

beforeEach(() => {
  jest.useFakeTimers();
  setIntervalSpy = jest.spyOn(global, 'setInterval');
  clearIntervalSpy = jest.spyOn(global, 'clearInterval');
  clearPixelCache();
  drawCharacterMock.mockClear();
  drawSceneMock.mockClear();
  setReducedMotionOverride(false);
});

afterEach(() => {
  setIntervalSpy.mockRestore();
  clearIntervalSpy.mockRestore();
  setReducedMotionOverride(null);
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('<Sprite> NOVA think tick', () => {
  it('cycles drawCharacter tick 0→1→2→0 on a stepped timer when animated', async () => {
    await render(<Sprite id="n" frame="think" animate="bob" testID="nova" />);
    expect(drawCharacterMock).toHaveBeenLastCalledWith('n', 'think', 0);
    await advance(THINK_STEP_MS);
    expect(drawCharacterMock).toHaveBeenLastCalledWith('n', 'think', 1);
    await advance(THINK_STEP_MS);
    expect(drawCharacterMock).toHaveBeenLastCalledWith('n', 'think', 2);
    await advance(THINK_STEP_MS);
    // wraps back to 0 → served from the PNG cache, no redraw; cache is bounded at 3 frames
    expect(argSet(drawCharacterMock, 2)).toEqual(new Set([0, 1, 2]));
    await advance(THINK_STEP_MS * 9);
    expect(drawCharacterMock).toHaveBeenCalledTimes(3);
    expect(pixelCacheStats().size).toBe(3);
  });

  it('stays on the static tick-0 frame under reduced motion', async () => {
    setReducedMotionOverride(true);
    await render(<Sprite id="n" frame="think" animate="bob" />);
    await advance(THINK_STEP_MS * 10);
    expect(argSet(drawCharacterMock, 2)).toEqual(new Set([0]));
    expect(live(THINK_STEP_MS)).toHaveLength(0);
  });

  it('non-think frames always draw tick 0 (people and idle NOVA)', async () => {
    await render(<Sprite id="z" animate="talk" />);
    await advance(THINK_STEP_MS * 6);
    expect(argSet(drawCharacterMock, 2)).toEqual(new Set([0]));
  });

  it('clears every timer on unmount', async () => {
    const r = await render(<Sprite id="n" frame="think" animate="bob" />);
    expect(live(THINK_STEP_MS)).toHaveLength(1);
    await act(async () => {
      r.unmount();
    });
    expect(intervalsAt(THINK_STEP_MS).length).toBeGreaterThan(0);
    expect(live(THINK_STEP_MS)).toHaveLength(0);
    const calls = drawCharacterMock.mock.calls.length;
    await advance(THINK_STEP_MS * 10);
    expect(drawCharacterMock.mock.calls.length).toBe(calls);
  });
});

describe('<Scene> ambient frames', () => {
  it('alternates drawScene frame 0/1 on a stepped timer when ambient is on (2 cached frames max)', async () => {
    await render(<Scene id="lab" ambient testID="scene" />);
    expect(drawSceneMock.mock.calls.at(-1)?.[3]).toBe(0);
    await advance(AMBIENT_STEP_MS);
    expect(drawSceneMock.mock.calls.at(-1)?.[3]).toBe(1);
    await advance(AMBIENT_STEP_MS * 20);
    expect(argSet(drawSceneMock, 3)).toEqual(new Set([0, 1]));
    expect(drawSceneMock).toHaveBeenCalledTimes(2);
    expect(pixelCacheStats().size).toBe(2);
  });

  it('renders a single static frame when ambient is off', async () => {
    await render(<Scene id="city" />);
    await advance(AMBIENT_STEP_MS * 10);
    expect(argSet(drawSceneMock, 3)).toEqual(new Set([0]));
    expect(live(AMBIENT_STEP_MS)).toHaveLength(0);
  });

  it('renders a single static frame under reduced motion even with ambient on', async () => {
    setReducedMotionOverride(true);
    await render(<Scene id="lab" ambient />);
    await advance(AMBIENT_STEP_MS * 10);
    expect(argSet(drawSceneMock, 3)).toEqual(new Set([0]));
    expect(live(AMBIENT_STEP_MS)).toHaveLength(0);
  });

  it('clears its timer on unmount', async () => {
    const r = await render(<Scene id="forge" ambient />);
    expect(live(AMBIENT_STEP_MS)).toHaveLength(1);
    await act(async () => {
      r.unmount();
    });
    expect(live(AMBIENT_STEP_MS)).toHaveLength(0);
    const calls = drawSceneMock.mock.calls.length;
    await advance(AMBIENT_STEP_MS * 10);
    expect(drawSceneMock.mock.calls.length).toBe(calls);
  });
});
