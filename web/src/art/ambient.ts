// Ambient scene frames (spec/ui.md → Pixel art: "2-frame ambient overlay at 4 fps").
// Each helper paints the frame-dependent part of one v3 `SC.*` scene. Frame 0 is v3's
// geometry exactly; frame 1 is the ambient variation:
//   lab   — screen pixels and server LEDs blink
//   forge — fire flickers (flame tongues rise, sparks move)
//   city  — windows twinkle, HIRE sign flickers
//   news  — desk-lamp glow pulses
//   title — glitch lines shift
//   meadow— static (both frames identical)
// Reduced motion: <Scene> never advances past frame 0 (useFrameCycle); `ambientFrame`
// mirrors that rule for non-hook callers.
import type { SceneId } from '../contracts/art';
import type { PixelBuffer } from '../pixel/framebuffer';
import { PAL } from '../pixel/palette';
import { dith, rc, rnd, txt } from '../pixel/primitives';

export type AmbientFrame = 0 | 1;

/** Scenes whose frame 1 differs from frame 0. */
export const AMBIENT_SCENES: readonly SceneId[] = ['lab', 'forge', 'city', 'news', 'title'];

/** Colours used only by ambient frame 1 (dimmed/brightened variants of v3 scene colours). */
export const AMBIENT_PAL = {
  labScreenOff: '#031318', // = v3 lab screen background
  labScreenOn: '#3ee98a',
  hireBorderDim: '#7a1650',
  hireTextDim: '#8a2f66',
  lampHot: '#fff2a8', // = v3 forge core
  lampPool: '#7a4a28',
} as const;

/** Frame index for a running tick; always 0 (static) under reduced motion. */
export function ambientFrame(tick: number, reducedMotion: boolean): AmbientFrame {
  if (reducedMotion || !Number.isFinite(tick)) return 0;
  return (Math.abs(Math.floor(tick)) % 2) as AmbientFrame;
}

// ---- lab -------------------------------------------------------------------------------

/** Big TRAIN screen cell (i 0..14, j 0..6) lit? Frame 0 = v3 `rnd(i*3+j*11)>.5`. */
export function labScreenLit(i: number, j: number, frame: AmbientFrame): boolean {
  const on = rnd(i * 3 + j * 11) > 0.5;
  if (frame === 0) return on;
  return rnd(i * 5.1 + j * 2.7 + 0.3) > 0.72 ? !on : on;
}

/** Server-rack LED colour. Frame 0 = v3; frame 1 re-rolls ~1/3 of LEDs. */
export function labLed(x: number, i: number, j: number, frame: AmbientFrame): string {
  const v3 = rnd(x + i * 7 + j) > 0.55 ? PAL.e : rnd(i + j * 3) > 0.5 ? PAL.r : PAL.y;
  if (frame === 0 || rnd(x * 0.37 + i * 3.1 + j * 5.3) <= 0.66) return v3;
  return v3 === PAL.e ? PAL.y : PAL.e;
}

// ---- forge -----------------------------------------------------------------------------

/** Forge fire. Frame 0 = v3 layers; frame 1 = inner tongues 2–3 px taller, new flicker dither. */
export function forgeFire(fb: PixelBuffer, frame: AmbientFrame): void {
  rc(fb, 70, 20, 52, 40, '#ff7a1a');
  if (frame === 0) {
    rc(fb, 74, 26, 44, 34, PAL.o);
    rc(fb, 80, 34, 32, 26, PAL.y);
    rc(fb, 88, 42, 16, 18, AMBIENT_PAL.lampHot);
    dith(fb, 70, 20, 52, 40, '#ff5d1a', 3, 0.12);
  } else {
    rc(fb, 74, 24, 44, 36, PAL.o);
    rc(fb, 80, 31, 32, 29, PAL.y);
    rc(fb, 88, 39, 16, 21, AMBIENT_PAL.lampHot);
    dith(fb, 70, 20, 52, 40, '#ff5d1a', 4, 0.12);
  }
}

/** Forge sparks (v3 seeds 21 / 5 on frame 0, shifted seeds on frame 1). */
export function forgeSparks(fb: PixelBuffer, frame: AmbientFrame): void {
  dith(fb, 60, 10, 76, 52, PAL.y, frame === 0 ? 21 : 22, 0.02);
  dith(fb, 40, 20, 110, 40, '#ff9a3a', frame === 0 ? 5 : 6, 0.015);
}

// ---- city ------------------------------------------------------------------------------

/** City window (building i, row j, column k) lit? Frame 0 = v3 `rnd(i*13+j*5+k)>.45`. */
export function cityWindowLit(i: number, j: number, k: number, frame: AmbientFrame): boolean {
  const on = rnd(i * 13 + j * 5 + k) > 0.45;
  if (frame === 0) return on;
  return rnd(i * 7.7 + j * 3.3 + k * 11.1 + 0.5) > 0.85 ? !on : on;
}

/** HIRE neon sign. Frame 0 = v3; frame 1 = flickered (dimmed) tube + letters. */
export function hireSign(fb: PixelBuffer, frame: AmbientFrame): void {
  rc(fb, 76, 24, 40, 14, '#0a0620');
  rc(fb, 77, 25, 38, 12, frame === 0 ? '#ff2e9a' : AMBIENT_PAL.hireBorderDim);
  rc(fb, 79, 27, 34, 8, '#1a0630');
  txt(fb, 82, 28, 'HIRE', frame === 0 ? PAL.m : AMBIENT_PAL.hireTextDim);
}

// ---- news ------------------------------------------------------------------------------

/** Desk lamp (shade + base). Frame 1 adds the pulse: hot shade rim + light pool on the desk. */
export function newsLamp(fb: PixelBuffer, frame: AmbientFrame): void {
  rc(fb, 128, 44, 6, 4, PAL.y);
  rc(fb, 124, 36, 14, 8, PAL.y);
  if (frame === 1) {
    rc(fb, 124, 43, 14, 1, AMBIENT_PAL.lampHot);
    rc(fb, 118, 48, 26, 1, AMBIENT_PAL.lampPool);
    rc(fb, 128, 44, 6, 1, AMBIENT_PAL.lampHot);
  }
}

// ---- title -----------------------------------------------------------------------------

/** Title glitch lines. Frame 0 = v3 positions; frame 1 = each line jumps ±1..6 px sideways. */
export function titleGlitch(fb: PixelBuffer, w: number, frame: AmbientFrame): void {
  for (let i = 0; i < 12; i++) {
    const gy = 20 + Math.floor(rnd(i * 4.1) * 40);
    const x = Math.floor(rnd(i * 2.2) * w);
    const shift = frame === 0 ? 0 : (rnd(i * 5.3 + 1) > 0.5 ? 1 : -1) * (1 + Math.floor(rnd(i * 9.7) * 6));
    rc(fb, x + shift, gy, 10 + Math.floor(rnd(i) * 30), 1, rnd(i) > 0.5 ? PAL.m : PAL.c);
  }
}
