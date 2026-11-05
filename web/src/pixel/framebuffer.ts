// RGBA framebuffer — the platform-independent replacement for v3's <canvas> (lines 145–149).
import type { FrameBuffer } from '../contracts/art';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number; // 0..1
}

const colorCache = new Map<string, RGBA | null>();

/** Parse '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(r,g,b)', 'rgba(r,g,b,a)'. Unknown → null. */
export function parseColor(c: string): RGBA | null {
  const hit = colorCache.get(c);
  if (hit !== undefined) return hit;
  let out: RGBA | null = null;
  const s = c.trim().toLowerCase();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (/^[0-9a-f]{3}$/.test(h)) {
      out = {
        r: parseInt(h.charAt(0) + h.charAt(0), 16),
        g: parseInt(h.charAt(1) + h.charAt(1), 16),
        b: parseInt(h.charAt(2) + h.charAt(2), 16),
        a: 1,
      };
    } else if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) {
      out = {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
  } else {
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
    if (m) {
      out = {
        r: Math.min(255, Number(m[1])),
        g: Math.min(255, Number(m[2])),
        b: Math.min(255, Number(m[3])),
        a: m[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(m[4]))),
      };
    }
  }
  colorCache.set(c, out);
  return out;
}

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

export class PixelBuffer implements FrameBuffer {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number, data?: Uint8ClampedArray) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
      throw new Error(`FrameBuffer size must be positive integers, got ${w}×${h}`);
    }
    this.w = w;
    this.h = h;
    this.data = data ?? new Uint8ClampedArray(w * h * 4);
    if (this.data.length !== w * h * 4) throw new Error('FrameBuffer data length mismatch');
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** '#rrggbb' of the pixel, '' when transparent or out of bounds. */
  get(x: number, y: number): string {
    if (!this.inBounds(x, y)) return '';
    const i = (y * this.w + x) * 4;
    if ((this.data[i + 3] ?? 0) === 0) return '';
    return `#${hex2(this.data[i] ?? 0)}${hex2(this.data[i + 1] ?? 0)}${hex2(this.data[i + 2] ?? 0)}`;
  }

  /** Alpha 0..255 of the pixel (0 out of bounds). */
  alpha(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3] ?? 0;
  }

  /** Canvas-style source-over blend of one pixel. Integer coords only; OOB is clipped. */
  blend(x: number, y: number, c: RGBA): void {
    if (!this.inBounds(x, y) || c.a <= 0) return;
    const d = this.data;
    const i = (y * this.w + x) * 4;
    if (c.a >= 1) {
      d[i] = c.r;
      d[i + 1] = c.g;
      d[i + 2] = c.b;
      d[i + 3] = 255;
      return;
    }
    const da = (d[i + 3] ?? 0) / 255;
    const oa = c.a + da * (1 - c.a);
    const mix = (sc: number, dc: number): number => (sc * c.a + dc * da * (1 - c.a)) / oa;
    d[i] = Math.round(mix(c.r, d[i] ?? 0));
    d[i + 1] = Math.round(mix(c.g, d[i + 1] ?? 0));
    d[i + 2] = Math.round(mix(c.b, d[i + 2] ?? 0));
    d[i + 3] = Math.round(oa * 255);
  }

  /** Fill an integer rectangle (already rounded), clipped to the buffer. */
  fill(x: number, y: number, w: number, h: number, color: string): void {
    const c = parseColor(color);
    if (!c || w <= 0 || h <= 0) return;
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.w, x + w);
    const y1 = Math.min(this.h, y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.blend(xx, yy, c);
  }

  clone(): PixelBuffer {
    return new PixelBuffer(this.w, this.h, new Uint8ClampedArray(this.data));
  }
}

export function createFrameBuffer(w: number, h: number): PixelBuffer {
  return new PixelBuffer(w, h);
}

/** Copy `src` onto `dst` at (dx,dy) with source-over blending. */
export function blit(dst: PixelBuffer, src: FrameBuffer, dx = 0, dy = 0): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      const a = src.data[i + 3] ?? 0;
      if (a === 0) continue;
      dst.blend(dx + x, dy + y, { r: src.data[i] ?? 0, g: src.data[i + 1] ?? 0, b: src.data[i + 2] ?? 0, a: a / 255 });
    }
  }
}

/** Sub-rectangle copy (v3 `head()` crops a 14×14 face out of a 24×32 sprite). */
export function crop(src: FrameBuffer, x: number, y: number, w: number, h: number): PixelBuffer {
  const out = new PixelBuffer(w, h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      const sy = y + yy;
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const si = (sy * src.w + sx) * 4;
      const di = (yy * w + xx) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k] ?? 0;
    }
  }
  return out;
}

/** Nearest-neighbour integer upscale (native pre-upscale; crisp at any size). */
export function scaleUp(src: FrameBuffer, s: number): PixelBuffer {
  const k = Math.max(1, Math.floor(s));
  if (k === 1) return new PixelBuffer(src.w, src.h, new Uint8ClampedArray(src.data));
  const out = new PixelBuffer(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) {
    const sy = Math.floor(y / k);
    for (let x = 0; x < out.w; x++) {
      const si = (sy * src.w + Math.floor(x / k)) * 4;
      const di = (y * out.w + x) * 4;
      out.data[di] = src.data[si] ?? 0;
      out.data[di + 1] = src.data[si + 1] ?? 0;
      out.data[di + 2] = src.data[si + 2] ?? 0;
      out.data[di + 3] = src.data[si + 3] ?? 0;
    }
  }
  return out;
}

/** Map every opaque pixel's colour (greyscale "locked" banners, dimmed backdrops). */
export function mapColors(src: FrameBuffer, fn: (r: number, g: number, b: number) => [number, number, number]): PixelBuffer {
  const out = new PixelBuffer(src.w, src.h, new Uint8ClampedArray(src.data));
  for (let i = 0; i < out.data.length; i += 4) {
    if ((out.data[i + 3] ?? 0) === 0) continue;
    const [r, g, b] = fn(out.data[i] ?? 0, out.data[i + 1] ?? 0, out.data[i + 2] ?? 0);
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
  }
  return out;
}

/**
 * 1 px outline around every opaque pixel (4-neighbour), replacing v3's CSS `.stk`
 * drop-shadow sticker effect. Output is (w+2)×(h+2).
 */
export function outline(src: FrameBuffer, color = '#ffffff'): PixelBuffer {
  const out = new PixelBuffer(src.w + 2, src.h + 2);
  const c = parseColor(color);
  if (!c) throw new Error(`bad outline colour ${color}`);
  const opaque = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < src.w && y < src.h && (src.data[(y * src.w + x) * 4 + 3] ?? 0) > 0;
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const sx = x - 1;
      const sy = y - 1;
      if (opaque(sx, sy)) continue;
      if (opaque(sx - 1, sy) || opaque(sx + 1, sy) || opaque(sx, sy - 1) || opaque(sx, sy + 1)) out.blend(x, y, c);
    }
  }
  blit(out, src, 1, 1);
  return out;
}
