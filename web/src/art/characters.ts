// Characters — faithful port of v3 `drawChar` / `drawNova` (spec/GLITCH v3.html lines 224–245)
// onto the scaffold framebuffer, plus the fidelity-upgrade frames (spec/ui.md → Pixel art):
//   idle  — v3 geometry exactly
//   blink — eyes closed to 1 row (SCOUT: goggle lenses shutter, eyes are behind them)
//   talk  — mouth open 2×2 (NOVA: 2×2 voice light in the visor)
//   think — NOVA only: antenna light cycles 3 colours, eyes scan left/centre/right by `tick`
// People are 24×32, NOVA ('n') 24×28 (contracts/art.ts).
import type { CharacterId } from '../contracts/ids';
import { CHAR_H, CHAR_W, NOVA_H, type CharFrame, type FrameBuffer } from '../contracts/art';
import { createFrameBuffer, type PixelBuffer } from '../pixel/framebuffer';
import { PAL } from '../pixel/palette';
import { cir, part, px1, rc } from '../pixel/primitives';
import { characterLook, type Look } from '../content/heroes';

/**
 * Literal colours v3's drawChar/drawNova use that are not in PAL (v3 lines 226–244).
 * Kept here, named, so every art colour has one definition.
 */
export const CHAR_PAL = {
  cape: '#3a1d7a',
  shoe: '#241d3d',
  shade: 'rgba(0,0,0,.25)',
  sheen: 'rgba(255,255,255,.18)',
  blush: '#ff9aa8',
  mouth: '#8a3b3b',
  shieldFace: '#c9d2ff',
  white: '#fff',
  novaBody: '#d7defa',
  novaShade: 'rgba(0,0,0,.15)',
  novaVisor: '#0b0f2a',
} as const;

/** NOVA 'think' antenna light, one colour per tick (red → yellow → teal). */
export const NOVA_THINK_COLORS = [PAL.r, PAL.y, PAL.c] as const;

const K = PAL.k;

/** Normalise any tick to 0..2. */
export function thinkTick(tick: number): 0 | 1 | 2 {
  const t = Number.isFinite(tick) ? Math.floor(tick) : 0;
  return (((t % 3) + 3) % 3) as 0 | 1 | 2;
}

function drawPerson(fb: PixelBuffer, o: Look, frame: CharFrame): void {
  const p = (x: number, y: number, w: number, h: number, c: string): void => part(fb, x, y, w, h, c, K);
  if (o.acc === 'cape') p(5, 14, 14, 15, CHAR_PAL.cape);
  if (o.hs === 'long') p(5, 4, 14, 16, o.hair);
  p(8, 23, 3, 6, o.bot);
  p(13, 23, 3, 6, o.bot);
  p(7, 28, 5, 3, CHAR_PAL.shoe);
  p(12, 28, 5, 3, CHAR_PAL.shoe);
  p(6, 14, 12, 10, o.top);
  rc(fb, 6, 22, 12, 2, CHAR_PAL.shade);
  rc(fb, 11, 14, 2, 10, CHAR_PAL.sheen);
  p(3, 15, 3, 8, o.top);
  p(18, 15, 3, 8, o.top);
  rc(fb, 3, 21, 3, 2, o.skin);
  rc(fb, 18, 21, 3, 2, o.skin);
  p(7, 3, 10, 10, o.skin);
  rc(fb, 10, 13, 4, 1, o.skin);
  // eyes: idle 2×2; blink closes to the lower row
  if (frame === 'blink') {
    rc(fb, 9, 9, 2, 1, K);
    rc(fb, 13, 9, 2, 1, K);
  } else {
    rc(fb, 9, 8, 2, 2, K);
    rc(fb, 13, 8, 2, 2, K);
  }
  rc(fb, 8, 10, 1, 1, CHAR_PAL.blush);
  rc(fb, 15, 10, 1, 1, CHAR_PAL.blush);
  // mouth: idle 2×1; talk opens to 2×2
  rc(fb, 11, 11, 2, frame === 'talk' ? 2 : 1, CHAR_PAL.mouth);
  const h = o.hair;
  if (o.hs === 'short' || o.hs === 'long' || o.hs === 'bun') {
    p(6, 2, 12, 4, h);
    rc(fb, 6, 5, 2, 3, h);
    rc(fb, 16, 5, 2, 3, h);
    if (o.hs === 'bun') p(10, -1, 4, 3, h);
  }
  if (o.hs === 'spiky') {
    p(6, 2, 12, 4, h);
    rc(fb, 6, 5, 3, 4, h);
    rc(fb, 16, 5, 2, 3, h);
    p(11, 0, 6, 3, h);
  }
  if (o.hs === 'helmet') {
    p(5, 2, 14, 5, h);
    rc(fb, 5, 6, 2, 6, h);
    rc(fb, 17, 6, 2, 6, h);
    rc(fb, 10, 1, 4, 2, PAL.y);
  }
  if (o.hs === 'hat') {
    p(4, 4, 16, 2, h);
    p(7, 1, 10, 3, h);
    p(9, -2, 6, 3, h);
    rc(fb, 11, 2, 2, 1, PAL.y);
  }
  if (o.acc === 'goggles') {
    rc(fb, 7, 7, 10, 3, PAL.y);
    // lenses: teal when open, shuttered (dark gold) on blink — the eyes sit behind them
    const lens = frame === 'blink' ? PAL.Y : PAL.c;
    rc(fb, 8, 8, 3, 1, lens);
    rc(fb, 13, 8, 3, 1, lens);
  }
  if (o.acc === 'shield') {
    p(0, 16, 5, 8, CHAR_PAL.shieldFace);
    rc(fb, 1, 18, 3, 4, PAL.r);
  }
  if (o.acc === 'orb') {
    cir(fb, 21, 21, 2, PAL.y);
    px1(fb, 20, 20, CHAR_PAL.white);
  }
  if (o.acc === 'cape') rc(fb, 11, 14, 2, 2, PAL.y);
}

function drawNova(fb: PixelBuffer, frame: CharFrame, tick: number): void {
  const p = (x: number, y: number, w: number, h: number, c: string): void => part(fb, x, y, w, h, c, K);
  const thinking = frame === 'think';
  const t = thinkTick(tick);
  p(11, 3, 2, 4, PAL.g);
  p(10, 0, 4, 3, thinking ? NOVA_THINK_COLORS[t] : PAL.r);
  p(3, 10, 2, 6, PAL.g);
  p(19, 10, 2, 6, PAL.g);
  p(5, 7, 14, 11, CHAR_PAL.novaBody);
  rc(fb, 5, 15, 14, 3, CHAR_PAL.novaShade);
  p(7, 10, 10, 5, CHAR_PAL.novaVisor);
  if (frame === 'blink') {
    rc(fb, 8, 13, 3, 1, PAL.c);
    rc(fb, 13, 13, 3, 1, PAL.c);
  } else {
    // think: eyes scan −1 / 0 / +1 px across the visor; every other frame is v3 (offset 0)
    const dx = thinking ? t - 1 : 0;
    rc(fb, 8 + dx, 11, 3, 3, PAL.c);
    rc(fb, 13 + dx, 11, 3, 3, PAL.c);
    rc(fb, 9 + dx, 12, 1, 1, CHAR_PAL.white);
    rc(fb, 14 + dx, 12, 1, 1, CHAR_PAL.white);
  }
  if (frame === 'talk') rc(fb, 11, 13, 2, 2, PAL.c);
  p(8, 19, 8, 6, PAL.g);
  rc(fb, 11, 21, 2, 2, PAL.c);
  p(6, 25, 4, 2, PAL.g);
  p(14, 25, 4, 2, PAL.g);
}

/**
 * Draw one character frame. 24×32 for people, 24×28 for NOVA ('n').
 * `tick` (any integer, normalised to 0..2) selects the step of NOVA 'think'.
 * 'think' on a person renders their idle frame (contract: 'think' only for 'n').
 */
export function drawCharacter(id: CharacterId, frame: CharFrame = 'idle', tick = 0): FrameBuffer {
  if (id === 'n') {
    const fb = createFrameBuffer(CHAR_W, NOVA_H);
    drawNova(fb, frame, tick);
    return fb;
  }
  const fb = createFrameBuffer(CHAR_W, CHAR_H);
  const look = characterLook(id);
  if (!look) throw new Error(`no look for character ${String(id)}`);
  drawPerson(fb, look, frame === 'think' ? 'idle' : frame);
  return fb;
}
