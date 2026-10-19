// m1g1 · Train the Model — the pointer-drag path through the real PanResponder handlers.
// Only zone measuring is stubbed (the test renderer has no layout): each zone gets a fixed
// window rect, everything else (8 px threshold, hover hit-test, drop) is the shipped code.
import React from 'react';
import { act, screen, within } from '@testing-library/react-native';
import { TrainTheModel } from '@/games/m1g1/Game';
import { STEP1_WRONG } from '@/games/m1g1/data';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';

const mockRects = [
  { id: 'spam', rect: { x: 0, y: 400, w: 150, h: 120 } },
  { id: 'ok', rect: { x: 170, y: 400, w: 150, h: 120 } },
];

jest.mock('@/dnd/useDrag', () => {
  const actual = jest.requireActual('@/dnd/useDrag');
  return { ...actual, useDropZones: () => ({ ref: () => () => undefined, measure: () => Promise.resolve(mockRects) }) };
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

/** Drive one item's pan handlers from (x0,y0) through `path`, releasing at the last point. */
async function drag(itemId: string, path: ReadonlyArray<readonly [number, number]>, from: readonly [number, number] = [60, 100]): Promise<void> {
  const host = screen.getByTestId(`dnd-item-${itemId}`).parent;
  if (!host) throw new Error('no drag host');
  const h = host.props as Record<string, Handler | undefined>;
  let ts = 1;
  const touch: Touch = {
    touchActive: true, startPageX: from[0], startPageY: from[1], startTimeStamp: ts,
    currentPageX: from[0], currentPageY: from[1], currentTimeStamp: ts, previousPageX: from[0], previousPageY: from[1], previousTimeStamp: ts,
  };
  const history = { numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: ts, touchBank: [touch] };
  const ev = (): unknown => ({
    touchHistory: history,
    nativeEvent: { pageX: touch.currentPageX, pageY: touch.currentPageY, touches: [], changedTouches: [] },
    currentTarget: 1,
  });
  const moveTo = (x: number, y: number): void => {
    ts += 16;
    touch.previousPageX = touch.currentPageX;
    touch.previousPageY = touch.currentPageY;
    touch.previousTimeStamp = touch.currentTimeStamp;
    touch.currentPageX = x;
    touch.currentPageY = y;
    touch.currentTimeStamp = ts;
    history.mostRecentTimeStamp = ts;
  };
  await act(async () => {
    h.onResponderStart?.(ev());
  });
  let granted = false;
  for (const [x, y] of path) {
    moveTo(x, y);
    await act(async () => {
      if (!granted) {
        if (h.onMoveShouldSetResponderCapture?.(ev())) {
          granted = true;
          h.onResponderGrant?.(ev());
        }
      } else h.onResponderMove?.(ev());
    });
  }
  touch.touchActive = false;
  history.numberActiveTouches = 0;
  await act(async () => {
    if (granted) h.onResponderRelease?.(ev());
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('<TrainTheModel> drag', () => {
  it('dragging an email past 8 px onto its zone places it', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<TrainTheModel api={api} />);
    await drag('e1', [[66, 106], [40, 300], [60, 450]]);
    expect(within(screen.getByTestId('dnd-zone-spam')).getByTestId('dnd-item-e1')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });

  it('dragging an email onto the wrong zone costs a heart with the v3 message', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<TrainTheModel api={api} />);
    await drag('e1', [[66, 106], [200, 300], [240, 450]]);
    expect(api.calls.miss).toEqual([STEP1_WRONG]);
    expect(api.hearts).toBe(2);
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e1')).toBeTruthy();
  });

  it('a movement under 8 px never starts a drag', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<TrainTheModel api={api} />);
    await drag('e1', [[63, 104]]);
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e1')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });

  it('releasing outside every zone drops nothing and costs nothing', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<TrainTheModel api={api} />);
    await drag('e2', [[70, 110], [160, 200], [500, 50]]);
    expect(within(screen.getByTestId('dnd-pool')).getByTestId('dnd-item-e2')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });
});
