// Narrow-screen helpers (spec/ui.md → Responsive: mobile-first, no horizontal scroll at 320 px).
import { layout } from './tokens';

/** Welcome cast sprite scale that keeps all four 24 px-wide sprites inside the banner. */
export function castScale(viewportWidth: number): number {
  if (viewportWidth < 400) return 2;
  if (viewportWidth <= layout.mobileBreakpoint) return 3;
  return 4;
}
