// v3 `grid()` (line 161): string-grid sprite → framebuffer. '.' (or unknown keys) = transparent.
import { createFrameBuffer, type PixelBuffer } from './framebuffer';
import { PAL, type Palette } from './palette';

export type Grid = readonly string[];

export function gridSize(g: Grid): { w: number; h: number } {
  return { w: g[0]?.length ?? 0, h: g.length };
}

export function drawGrid(g: Grid, pal: Palette = PAL): PixelBuffer {
  const { w, h } = gridSize(g);
  const fb = createFrameBuffer(w, h);
  for (let j = 0; j < h; j++) {
    const row = g[j] ?? '';
    for (let i = 0; i < row.length; i++) {
      const ch = row.charAt(i);
      if (ch === '.') continue;
      const c = pal[ch];
      if (c) fb.fill(i, j, 1, 1, c);
    }
  }
  return fb;
}
