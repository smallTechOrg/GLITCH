// m2g2 · Prompt Forge — the pointer-drag path through the real PanResponder handlers.
// Only zone measuring is stubbed (the test renderer has no layout): each of the five slots
// gets a fixed window rect; the 8 px threshold, hover hit-test and drop are the shipped code.
import React from 'react';
import { act, screen, within } from '@testing-library/react-native';
import { PromptForgeGame } from '@/games/m2g2/Game';
import { WRONG_DECOY, WRONG_SLOT } from '@/games/m2g2/data';
import { SORT_DONE_DELAY_MS } from '@/dnd/sortEngine';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';

// Slots in one row at y 400–520: task 0–100, ctx 110–210, role 220–320, fmt 330–430, lim 440–540.
const mockRects = ['task', 'ctx', 'role', 'fmt', 'lim'].map((id, i) => ({ id, rect: { x: i * 110, y: 400, w: 100, h: 120 } }));
const SLOT_X: Record<string, number> = { task: 50, ctx: 160, role: 270, fmt: 380, lim: 490 };

jest.mock('@/dnd/useDrag', () => {
  const actual = jest.requireActual('@/dnd/useDrag');
  return { ...actual, useDropZones: () => ({ ref: () => () => undefined, measure: () => Promise.resolve(mockRects) }) };
});

jest.mock('@/features/freewrite/FreeWriteRound', () => ({ FreeWriteRound: () => null }));

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

/** Drag an item onto a slot's centre. */
const dragToSlot = (itemId: string, slot: string): Promise<void> => drag(itemId, [[70, 110], [SLOT_X[slot] as number, 300], [SLOT_X[slot] as number, 460]]);

const inSlot = (itemId: string, slot: string) => within(screen.getByTestId(`dnd-zone-${slot}`)).queryByTestId(`dnd-item-${itemId}`);
const inPool = (itemId: string) => within(screen.getByTestId('dnd-pool')).queryByTestId(`dnd-item-${itemId}`);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('<PromptForgeGame> drag', () => {
  it('dragging a block past 8 px onto its slot places it', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<PromptForgeGame api={api} />);
    await dragToSlot('b2', 'ctx');
    expect(inSlot('b2', 'ctx')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });

  it('dragging a decoy into any slot costs a heart with the vague-block message and returns it to the pool', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<PromptForgeGame api={api} />);
    await dragToSlot('b6', 'lim');
    expect(api.calls.miss).toEqual([WRONG_DECOY]);
    expect(api.hearts).toBe(2);
    expect(inPool('b6')).toBeTruthy();
  });

  it('dragging a real block onto the wrong slot costs a heart with the slot message', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<PromptForgeGame api={api} />);
    await dragToSlot('b3', 'fmt');
    expect(api.calls.miss).toEqual([WRONG_SLOT]);
    expect(inPool('b3')).toBeTruthy();
  });

  it('a movement under 8 px or a release between slots drops nothing and costs nothing', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<PromptForgeGame api={api} />);
    await drag('b1', [[63, 104]]);
    await drag('b1', [[70, 110], [105, 300], [105, 460]]); // the 10 px gap between task and ctx
    expect(inPool('b1')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });

  it('forge 1 solved entirely by drag reaches PROMPT BUILT', async () => {
    const api = createTestGameApi();
    await renderWithProviders(<PromptForgeGame api={api} />);
    for (const [item, slot] of [['b5', 'lim'], ['b1', 'task'], ['b4', 'fmt'], ['b2', 'ctx'], ['b3', 'role']] as const) await dragToSlot(item, slot);
    await act(async () => {
      jest.advanceTimersByTime(SORT_DONE_DELAY_MS);
    });
    expect(screen.getByText('PROMPT BUILT')).toBeTruthy();
    expect(api.calls.miss).toHaveLength(0);
  });
});
