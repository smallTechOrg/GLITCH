// Drag maths: 8 px threshold (v3 |dx|+|dy| ≥ 8) and zone hit-testing in window coords.
import { DRAG_THRESHOLD_PX, exceedsThreshold, hitTest } from '@/dnd/useDrag';

describe('drag helpers', () => {
  it('starts a drag only after 8 px of combined movement', () => {
    expect(DRAG_THRESHOLD_PX).toBe(8);
    expect(exceedsThreshold(3, 4)).toBe(false);
    expect(exceedsThreshold(4, -4)).toBe(true);
    expect(exceedsThreshold(0, 0)).toBe(false);
  });

  it('finds the zone under the pointer (edges inclusive) or null', () => {
    const zones = [
      { id: 'spam', rect: { x: 0, y: 100, w: 100, h: 120 } },
      { id: 'ok', rect: { x: 112, y: 100, w: 100, h: 120 } },
    ];
    expect(hitTest(zones, 50, 150)).toBe('spam');
    expect(hitTest(zones, 212, 220)).toBe('ok');
    expect(hitTest(zones, 106, 150)).toBeNull();
    expect(hitTest([], 1, 1)).toBeNull();
  });
});
