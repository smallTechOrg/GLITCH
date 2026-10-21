// Drag plumbing on RN PanResponder + measureInWindow hit-testing (works on RN Web mouse/touch
// and native). Drag starts after 8 px of movement (v3 |dx|+|dy| ≥ 8); a quick tap stays a tap.
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, type GestureResponderEvent } from 'react-native';

/** Anything with RN's measureInWindow (View host instances on web and native). */
export interface Measurable {
  measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void;
}

const isMeasurable = (v: unknown): v is Measurable => typeof v === 'object' && v !== null && typeof (v as Measurable).measureInWindow === 'function';

export const DRAG_THRESHOLD_PX = 8;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ZoneRect {
  id: string;
  rect: Rect;
}

export const exceedsThreshold = (dx: number, dy: number, t: number = DRAG_THRESHOLD_PX): boolean => Math.abs(dx) + Math.abs(dy) >= t;

/** Zone under the point (window coords); the last matching zone wins (top-most). */
export function hitTest(zones: readonly ZoneRect[], x: number, y: number): string | null {
  let hit: string | null = null;
  for (const z of zones) if (x >= z.rect.x && x <= z.rect.x + z.rect.w && y >= z.rect.y && y <= z.rect.y + z.rect.h) hit = z.id;
  return hit;
}

/** Pointer position in window (viewport) coordinates, matching measureInWindow. */
export function pointerInWindow(e: GestureResponderEvent): { x: number; y: number } {
  const { pageX, pageY } = e.nativeEvent;
  if (Platform.OS === 'web') {
    const w = globalThis as unknown as { scrollX?: number; scrollY?: number };
    return { x: pageX - (w.scrollX ?? 0), y: pageY - (w.scrollY ?? 0) };
  }
  return { x: pageX, y: pageY };
}

/** Registry of drop-zone views; measures them on demand. */
export function useDropZones(): {
  ref: (id: string) => (v: unknown) => void;
  measure: () => Promise<ZoneRect[]>;
} {
  const nodes = useRef(new Map<string, Measurable>());
  return useMemo(
    () => ({
      ref: (id: string) => (v: unknown) => {
        if (isMeasurable(v)) nodes.current.set(id, v);
        else nodes.current.delete(id);
      },
      measure: () =>
        Promise.all(
          [...nodes.current.entries()].map(
            ([id, v]) =>
              new Promise<ZoneRect | null>((resolve) => {
                try {
                  v.measureInWindow((x, y, w, h) => resolve({ id, rect: { x, y, w, h } }));
                } catch {
                  resolve(null);
                }
              }),
          ),
        ).then((r) => r.filter((z): z is ZoneRect => z !== null)),
    }),
    [],
  );
}

export interface DragCallbacks {
  enabled: () => boolean;
  /** True while a no-drag control inside the item is being pressed (m4g1 CHECK). */
  suppressed?: () => boolean;
  onStart(): void;
  onMove(x: number, y: number): void;
  onEnd(x: number, y: number): void;
  onCancel(): void;
}

/** How long after a drag the browser's trailing `click` is ignored (v3 used 60 ms). */
export const CLICK_AFTER_DRAG_MS = 60;

/**
 * Web claims the gesture at press time. The responder system only offers a *move* to views
 * under the pointer, so on a quick drag whose first mousemove had already left the item the
 * item was never asked, and the drag silently did nothing. Taps still work: on web,
 * Pressable's onPress comes from the DOM `click`, not from the responder.
 */
const CLAIM_ON_PRESS = Platform.OS === 'web';

/** One draggable item: pan handlers + the translation to apply while dragging. */
export function useDragItem(cb: DragCallbacks): { panHandlers: object; offset: Animated.ValueXY; dragging: boolean; justDragged: () => boolean } {
  const live = useRef(cb);
  live.current = cb;
  const offset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState(false);
  const started = useRef(false);
  const lastDragEnd = useRef(0);
  const pan = useMemo(() => {
    const canDrag = (): boolean => live.current.enabled() && !live.current.suppressed?.();
    const begin = (): void => {
      started.current = true;
      setDragging(true);
      live.current.onStart();
    };
    const stop = (): boolean => {
      const was = started.current;
      started.current = false;
      offset.setValue({ x: 0, y: 0 });
      setDragging(false);
      if (was) lastDragEnd.current = Date.now();
      return was;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => CLAIM_ON_PRESS && live.current.enabled(),
      onMoveShouldSetPanResponder: (_e, g) => canDrag() && exceedsThreshold(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_e, g) => canDrag() && exceedsThreshold(g.dx, g.dy),
      onPanResponderGrant: () => {
        started.current = false;
        // Move-negotiated grants (native) only happen past the threshold: the drag is on.
        if (!CLAIM_ON_PRESS) begin();
      },
      onPanResponderMove: (e, g) => {
        if (!started.current) {
          if (!canDrag() || !exceedsThreshold(g.dx, g.dy)) return;
          begin();
        }
        offset.setValue({ x: g.dx, y: g.dy });
        const p = pointerInWindow(e);
        live.current.onMove(p.x, p.y);
      },
      onPanResponderRelease: (e) => {
        const p = pointerInWindow(e);
        if (stop()) live.current.onEnd(p.x, p.y);
      },
      onPanResponderTerminate: () => {
        if (stop()) live.current.onCancel();
      },
      onPanResponderTerminationRequest: () => false,
    });
  }, [offset]);
  const justDragged = useMemo(() => () => Date.now() - lastDragEnd.current < CLICK_AFTER_DRAG_MS, []);
  return { panHandlers: pan.panHandlers, offset, dragging, justDragged };
}
