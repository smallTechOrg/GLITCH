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

/** One draggable item: pan handlers + the translation to apply while dragging. */
export function useDragItem(cb: DragCallbacks): { panHandlers: object; offset: Animated.ValueXY; dragging: boolean } {
  const live = useRef(cb);
  live.current = cb;
  const offset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [dragging, setDragging] = useState(false);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => live.current.enabled() && !live.current.suppressed?.() && exceedsThreshold(g.dx, g.dy),
        onMoveShouldSetPanResponderCapture: (_e, g) => live.current.enabled() && !live.current.suppressed?.() && exceedsThreshold(g.dx, g.dy),
        onPanResponderGrant: () => {
          setDragging(true);
          live.current.onStart();
        },
        onPanResponderMove: (e, g) => {
          offset.setValue({ x: g.dx, y: g.dy });
          const p = pointerInWindow(e);
          live.current.onMove(p.x, p.y);
        },
        onPanResponderRelease: (e) => {
          const p = pointerInWindow(e);
          offset.setValue({ x: 0, y: 0 });
          setDragging(false);
          live.current.onEnd(p.x, p.y);
        },
        onPanResponderTerminate: () => {
          offset.setValue({ x: 0, y: 0 });
          setDragging(false);
          live.current.onCancel();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [offset],
  );
  return { panHandlers: pan.panHandlers, offset, dragging };
}
