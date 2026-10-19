// Faithful ports of v3's canvas primitives (spec/GLITCH v3.html lines 150–158). Identical
// maths; the target framebuffer is the first argument instead of v3's global `X`.
import type { PixelBuffer } from './framebuffer';
import { FONT3 } from './font3';

/** v3 `rnd(i)` — the seeded hash used for ALL procedural art. */
export function rnd(i: number): number {
  return Math.abs((Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1);
}

/** v3 `cl(v,a,b)` clamp (defaults 0..100). */
export function cl(v: number, a: number | null = 0, b: number | null = 100): number {
  return Math.max(a == null ? 0 : a, Math.min(b == null ? 100 : b, v));
}

/** v3 `shuf(a, seed)` — seeded Fisher–Yates (seed required: no Math.random in rules/art). */
export function shuf<T>(a: readonly T[], seed: number): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd(seed + i * 3.7) * (i + 1));
    const t = r[i] as T;
    r[i] = r[j] as T;
    r[j] = t;
  }
  return r;
}

/** v3 `rc` — fillRect with every coordinate rounded. */
export function rc(fb: PixelBuffer, x: number, y: number, w: number, h: number, c: string): void {
  fb.fill(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c);
}

/** v3 `px1` — one pixel (canvas fillRect(x,y,1,1); fractional coords snap to floor). */
export function px1(fb: PixelBuffer, x: number, y: number, c: string): void {
  fb.fill(Math.floor(x), Math.floor(y), 1, 1, c);
}

/** v3 `cir` — filled circle from horizontal spans. */
export function cir(fb: PixelBuffer, cx: number, cy: number, r: number, c: string): void {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y) + 0.5);
    rc(fb, cx - w, cy + y, w * 2 + 1, 1, c);
  }
}

/** v3 `band` — horizontal colour bands from y0 to y1. */
export function band(fb: PixelBuffer, y0: number, y1: number, cols: readonly string[], w: number): void {
  const n = cols.length;
  const h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) rc(fb, 0, y0 + i * h, w, Math.ceil(h), cols[i] as string);
}

/** v3 `mtn` — mountain silhouette columns. */
export function mtn(fb: PixelBuffer, w: number, base: number, amp: number, fr: number, seed: number, col: string): void {
  for (let x = 0; x < w; x++) {
    const h = base - Math.round(amp * (Math.sin(x * fr + seed) * 0.55 + Math.sin(x * fr * 2.7 + seed * 1.7) * 0.3 + 0.5));
    rc(fb, x, h, 1, 200, col);
  }
}

/** v3 `dith` — seeded dither: pixel set where rnd(...) < p. */
export function dith(fb: PixelBuffer, x: number, y: number, w: number, h: number, c: string, seed: number, p: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (rnd(seed + i * 7.3 + j * 13.1) < p) px1(fb, x + i, y + j, c);
}

/** v3 `txt` — 3×5 pixel text, 4 px advance. Unknown characters are skipped (v3 parity). */
export function txt(fb: PixelBuffer, x: number, y: number, s: string, c: string): void {
  for (let i = 0; i < s.length; i++) {
    const g = FONT3[s.charAt(i)];
    if (!g) continue;
    for (let j = 0; j < 15; j++) if (g.charAt(j) === '1') px1(fb, x + i * 4 + (j % 3), y + ((j / 3) | 0), c);
  }
}

/** Shared helper used by v3 drawChar/drawNova: a rect with a 1 px dark border. */
export function part(fb: PixelBuffer, x: number, y: number, w: number, h: number, c: string, k = '#16122b'): void {
  rc(fb, x - 1, y - 1, w + 2, h + 2, k);
  rc(fb, x, y, w, h, c);
}
