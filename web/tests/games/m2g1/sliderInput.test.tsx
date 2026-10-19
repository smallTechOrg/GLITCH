// m2g1 · Tune the Sorter — the two non-button slider inputs, through the shipped ui/Slider:
// web keyboard (←/→ ±1, PageUp/PageDown ±10, Home/End; RN Web only, so Platform.OS is
// switched to 'web' for this file) and a pointer drag/tap on the track (PanResponder).
// The real-browser keyboard run is e2e/module2.spec.ts.
import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { TuneTheSorterGame } from '@/games/m2g1/Game';
import { ROUND_1 } from '@/games/m2g1/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';

const realOS = Platform.OS;

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true, writable: true });
});
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true, writable: true });
  jest.useRealTimers();
});

async function setup() {
  const api = createTestGameApi();
  await renderWithProviders(<TuneTheSorterGame api={api} />);
  return api;
}

const value = (id: string): number => screen.getByTestId(`slider-${id}`).props.accessibilityValue.now as number;

async function key(id: string, k: string, times = 1): Promise<{ prevented: number }> {
  let prevented = 0;
  for (let i = 0; i < times; i++) {
    await fireEvent(screen.getByTestId(`slider-${id}`), 'keyDown', {
      nativeEvent: { key: k },
      preventDefault: () => {
        prevented += 1;
      },
    });
  }
  return { prevented };
}

describe('<TuneTheSorterGame> slider keyboard (web)', () => {
  it('arrow keys step the threshold by 1 and the rows re-score live', async () => {
    await setup();
    await key('th', 'ArrowRight', 5);
    expect(value('th')).toBe(55);
    expect(screen.getByTestId('slider-th-value')).toHaveTextContent('55');
    await key('th', 'ArrowLeft', 2);
    await key('th', 'ArrowDown');
    expect(value('th')).toBe(52);
    await key('th', 'ArrowUp');
    expect(value('th')).toBe(53);
  });

  it('PageUp / PageDown step by 10; Home / End jump to the range ends', async () => {
    await setup();
    await key('th', 'PageUp');
    expect(value('th')).toBe(60);
    await key('th', 'End');
    expect(value('th')).toBe(100);
    expect(screen.getByTestId('metric-a').props.accessibilityLabel).toBe('EMERGENCIES MISSED 4, goal at most 0, not met');
    await key('th', 'Home');
    expect(value('th')).toBe(0);
    await key('th', 'PageDown');
    expect(value('th')).toBe(0); // clamped at min
    await key('wc', 'End');
    expect(value('wc')).toBe(40); // caps weight max is 40, not 100
    await key('wc', 'PageUp');
    expect(value('wc')).toBe(40);
  });

  it('slider keys prevent the page scroll; other keys are ignored', async () => {
    await setup();
    expect((await key('th', 'ArrowRight')).prevented).toBe(1);
    expect((await key('th', 'Tab')).prevented).toBe(0);
    expect((await key('th', 'a')).prevented).toBe(0);
    expect(value('th')).toBe(51);
  });

  it('keyboard-only: tune to the R1 solution with keys and LOCK IT IN clears the round', async () => {
    const api = await setup();
    await key('th', 'End'); // A=4: would fail
    await key('th', 'PageDown', 4); // 60
    await key('th', 'ArrowLeft', 5); // 55 = X-RAY solution
    expect(value('th')).toBe(ROUND_1.sol[0]);
    await fireEvent.press(screen.getByTestId('m2g1-lock'));
    expect(api.calls.miss).toHaveLength(0);
    expect(api.lastSay()?.text).toBe('Round clear!');
  });

  it('keys do nothing once the game is over', async () => {
    const api = await setup();
    await key('th', 'End');
    for (let i = 0; i < 3; i++) await fireEvent.press(screen.getByTestId('m2g1-lock'));
    expect(api.status).toBe('failed');
    await key('th', 'Home');
    expect(value('th')).toBe(100);
  });
});

interface Touch {
  touchActive: boolean;
  startPageX: number;
  startPageY: number;
  startTimeStamp: number;
  currentPageX: number;
  currentPageY: number;
  currentTimeStamp: number;
  previousPageX: number;
  previousPageY: number;
  previousTimeStamp: number;
}
type Handler = (e: unknown) => unknown;

/** Lay the track out at `width` px, press at locationX `xs[0]`, move through the rest, release. */
async function dragTrack(id: string, width: number, xs: readonly number[]): Promise<void> {
  const track = screen.getByTestId(`slider-${id}`);
  await fireEvent(track, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } } });
  const h = screen.getByTestId(`slider-${id}`).props as Record<string, Handler | undefined>;
  let ts = 1;
  const x0 = xs[0] as number;
  const touch: Touch = {
    touchActive: true, startPageX: x0, startPageY: 10, startTimeStamp: ts,
    currentPageX: x0, currentPageY: 10, currentTimeStamp: ts, previousPageX: x0, previousPageY: 10, previousTimeStamp: ts,
  };
  const history = { numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: ts, touchBank: [touch] };
  const ev = (x: number): unknown => ({
    touchHistory: history,
    nativeEvent: { pageX: x, pageY: 10, locationX: x, locationY: 10, touches: [], changedTouches: [] },
    currentTarget: 1,
  });
  await act(async () => {
    expect(h.onStartShouldSetResponder?.(ev(x0))).toBe(true);
    h.onResponderGrant?.(ev(x0));
  });
  for (const x of xs.slice(1)) {
    ts += 16;
    touch.previousPageX = touch.currentPageX;
    touch.currentPageX = x;
    touch.currentTimeStamp = ts;
    history.mostRecentTimeStamp = ts;
    await act(async () => {
      h.onResponderMove?.(ev(x));
    });
  }
  touch.touchActive = false;
  history.numberActiveTouches = 0;
  await act(async () => {
    h.onResponderRelease?.(ev(xs[xs.length - 1] as number));
  });
}

describe('<TuneTheSorterGame> slider track pointer', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true, writable: true });
  });

  it('a tap on the track jumps the threshold to that position', async () => {
    await setup();
    await dragTrack('th', 200, [110]); // 110/200 of 0–100
    expect(value('th')).toBe(55);
  });

  it('dragging along the track follows the pointer and clamps past either end', async () => {
    await setup();
    await dragTrack('wc', 400, [100, 200, 300]); // 0–40 range → 30
    expect(value('wc')).toBe(30);
    await dragTrack('wc', 400, [300, 600]);
    expect(value('wc')).toBe(40);
    await dragTrack('th', 200, [100, -50]);
    expect(value('th')).toBe(0);
  });
});
