// Scenes — faithful port of v3 `tree`, `cloud` and `SC.*` (spec/GLITCH v3.html lines 247–278)
// onto the scaffold framebuffer. Default size 192×80; any size works (v3 parity: the
// compositions are drawn in absolute pixels and clipped). `frame` 1 paints the ambient
// variation (art/ambient.ts); frame 0 is v3 exactly.
//
// Colours: the procedural scenes use v3's literal scene colours verbatim (they are the
// scene palettes — v3 defines them nowhere else); colours shared with the sprite palette
// come from PAL.
import { SCENE_H, SCENE_W, type FrameBuffer, type SceneId } from '../contracts/art';
import { createFrameBuffer, type PixelBuffer } from '../pixel/framebuffer';
import { PAL } from '../pixel/palette';
import { band, cir, dith, mtn, px1, rc, rnd, txt } from '../pixel/primitives';
import {
  cityWindowLit,
  forgeFire,
  forgeSparks,
  hireSign,
  labLed,
  labScreenLit,
  newsLamp,
  titleGlitch,
  type AmbientFrame,
} from './ambient';

type SceneFn = (fb: PixelBuffer, w: number, h: number, frame: AmbientFrame) => void;

const WHITE = '#fff';

/** v3 `tree(x,y,s)`. */
function tree(fb: PixelBuffer, x: number, y: number, s?: number): void {
  rc(fb, x, y, 2, 3, PAL.N);
  for (let k = 0; k < 4; k++) {
    const hw = 1 + k * (s || 1);
    rc(fb, x + 1 - hw, y - 3 * k - 3, hw * 2, 3, k % 2 ? '#1f6b3a' : '#2a8a4a');
  }
}

/** v3 `cloud(x,y,w)`. */
function cloud(fb: PixelBuffer, x: number, y: number, w: number): void {
  rc(fb, x, y, w, 3, WHITE);
  rc(fb, x + 2, y - 2, w - 5, 2, WHITE);
  rc(fb, x + 1, y + 3, w - 3, 1, '#d6ecff');
}

const meadow: SceneFn = (fb, w, h) => {
  band(fb, 0, 56, ['#2f8fff', '#4aa3ff', '#66b5ff', '#85c6ff', '#a6d6ff', '#c4e4ff'], w);
  cloud(fb, 14, 10, 22);
  cloud(fb, 70, 6, 28);
  cloud(fb, 130, 14, 20);
  cloud(fb, 100, 22, 16);
  mtn(fb, w, 50, 22, 0.04, 1, '#4b7fc4');
  mtn(fb, w, 58, 16, 0.06, 5, '#3a67a8');
  mtn(fb, w, 66, 9, 0.05, 3, '#2e9e5a');
  rc(fb, 0, 66, w, h - 66, '#2f8f4a');
  dith(fb, 0, 66, w, h - 66, '#3fbf6f', 11, 0.25);
  mtn(fb, w, 74, 6, 0.08, 8, '#38b46a');
  rc(fb, 0, 76, w, h, '#2a7f44');
  [10, 40, 150, 176, 100].forEach((x, i) => tree(fb, x, 60 + (i % 3) * 3, 1 + (i % 2)));
};

const lab: SceneFn = (fb, w, h, frame) => {
  rc(fb, 0, 0, w, h, '#0d2531');
  for (let x = 0; x < w; x += 24) rc(fb, x, 0, 1, 56, '#123546');
  rc(fb, 0, 18, w, 1, '#123546');
  rc(fb, 0, 56, w, h - 56, '#07161d');
  for (let x = 0; x < w; x += 16) rc(fb, x, 56, 1, h - 56, '#0c222c');
  rc(fb, 0, 56, w, 2, '#1c4a5e');
  [8, 150].forEach((x) => {
    rc(fb, x, 10, 34, 46, '#16384a');
    rc(fb, x + 1, 11, 32, 44, '#1a4560');
    for (let j = 0; j < 6; j++) {
      rc(fb, x + 3, 13 + j * 7, 28, 5, '#0b1f2b');
      for (let i = 0; i < 7; i++) px1(fb, x + 5 + i * 4, 15 + j * 7, labLed(x, i, j, frame));
    }
  });
  rc(fb, 62, 8, 68, 40, '#0a1a22');
  rc(fb, 64, 10, 64, 36, '#031318');
  for (let j = 0; j < 7; j++) for (let i = 0; i < 15; i++) if (labScreenLit(i, j, frame)) rc(fb, 66 + i * 4, 12 + j * 5, 2, 2, PAL.e);
  txt(fb, 86, 40, 'TRAIN', PAL.c);
  rc(fb, 60, 48, 72, 3, '#1c4a5e');
  rc(fb, 0, 66, w, 8, '#2b3a45');
  rc(fb, 0, 66, w, 1, '#4b5f6e');
  for (let x = 0; x < w; x += 8) rc(fb, x + 2, 69, 3, 3, '#1d2832');
  [20, 70, 120, 165].forEach((x, i) => {
    rc(fb, x, 58, 10, 8, i % 2 ? '#c99a5b' : '#a5733a');
    rc(fb, x, 58, 10, 2, '#e0b87a');
    rc(fb, x + 4, 60, 2, 6, '#e0b87a');
  });
  rc(fb, 0, 74, w, 6, '#0a1a22');
};

const forge: SceneFn = (fb, w, h, frame) => {
  rc(fb, 0, 0, w, h, '#2a1a16');
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 14; i++) {
      const x = i * 14 + (j % 2 ? 7 : 0) - 7;
      rc(fb, x, j * 8, 13, 7, rnd(i * 5 + j * 9) > 0.5 ? '#3a2620' : '#33211b');
    }
  }
  rc(fb, 0, 58, w, h - 58, '#1a0f0c');
  for (let i = 0; i < w; i += 12) rc(fb, i, 58, 1, h - 58, '#241512');
  rc(fb, 0, 58, w, 2, '#4a2c22');
  rc(fb, 66, 16, 60, 44, '#120907');
  forgeFire(fb, frame);
  rc(fb, 60, 10, 72, 8, '#3b2c28');
  rc(fb, 62, 12, 68, 3, '#5a423b');
  rc(fb, 20, 50, 34, 8, PAL.k);
  rc(fb, 26, 44, 22, 6, PAL.d);
  rc(fb, 22, 46, 6, 3, PAL.d);
  rc(fb, 14, 48, 8, 2, PAL.d);
  rc(fb, 24, 58, 26, 4, '#0d0a1c');
  [
    [142, 14],
    [152, 22],
    [162, 12],
    [172, 24],
  ].forEach(([px, py], i) => {
    const x = px as number;
    const y = py as number;
    rc(fb, x, y, 2, 16 + i * 3, '#6b5a52');
    rc(fb, x - 3, y + 16 + i * 3, 8, 4, '#8a7a72');
  });
  forgeSparks(fb, frame);
};

const city: SceneFn = (fb, w, h, frame) => {
  band(fb, 0, 50, ['#0a0722', '#100a30', '#170f40', '#201552', '#2c1b66', '#3b2278'], w);
  for (let i = 0; i < 40; i++) px1(fb, Math.floor(rnd(i) * w), Math.floor(rnd(i + 50) * 34), rnd(i + 9) > 0.6 ? WHITE : '#9aa0ff');
  cir(fb, 160, 16, 7, '#fff6c8');
  cir(fb, 163, 14, 6, '#0f0a30');
  const cols = ['#150d3a', '#1a1048', '#120a33'] as const;
  for (let i = 0; i < 16; i++) {
    const bx = i * 12;
    const bh = 18 + Math.floor(rnd(i * 2.1) * 34);
    rc(fb, bx, 64 - bh, 11, bh, cols[i % 3] as string);
    for (let j = 0; j < bh / 6; j++) {
      for (let k = 0; k < 2; k++) {
        if (cityWindowLit(i, j, k, frame)) rc(fb, bx + 2 + k * 5, 66 - bh + j * 6, 3, 3, rnd(i + j) > 0.8 ? PAL.m : PAL.y);
      }
    }
  }
  rc(fb, 0, 64, w, h - 64, '#0d0a24');
  rc(fb, 0, 64, w, 2, '#3a2a7a');
  rc(fb, 0, 74, w, 1, '#4a3a8a');
  for (let i = 0; i < w; i += 20) rc(fb, i, 70, 10, 1, '#6a5ac0');
  hireSign(fb, frame);
  rc(fb, 95, 38, 2, 16, '#3a2a7a');
};

const NEWS_BARS = [PAL.r, PAL.b, PAL.y, PAL.p, PAL.e] as const;

const news: SceneFn = (fb, w, h, frame) => {
  rc(fb, 0, 0, w, h, '#14261f');
  for (let x = 0; x < w; x += 16) rc(fb, x, 0, 1, 60, '#1b3329');
  rc(fb, 0, 58, w, h - 58, '#0d1a15');
  for (let x = 0; x < w; x += 14) rc(fb, x, 58, 1, h - 58, '#12241d');
  rc(fb, 0, 58, w, 2, '#3a2a1a');
  [6, 150].forEach((bx) => {
    rc(fb, bx, 6, 36, 52, '#2a1a10');
    for (let r = 0; r < 4; r++) {
      rc(fb, bx + 2, 8 + r * 12, 32, 10, '#1b100a');
      for (let i = 0; i < 9; i++) {
        const bh = 6 + Math.floor(rnd(bx + r * 9 + i) * 4);
        rc(fb, bx + 3 + i * 3.5, 18 + r * 12 - bh, 3, bh, NEWS_BARS[Math.floor(rnd(i + r * 7 + bx) * 5)] as string);
      }
    }
  });
  rc(fb, 56, 8, 80, 38, '#3a2a1a');
  rc(fb, 58, 10, 76, 34, '#d9c79a');
  const notes: ReadonlyArray<readonly [number, number, string]> = [
    [62, 14, WHITE],
    [84, 18, PAL.y],
    [106, 13, WHITE],
    [70, 30, PAL.b],
    [96, 29, WHITE],
    [118, 32, PAL.m],
  ];
  notes.forEach(([x, y, c]) => {
    rc(fb, x, y, 14, 10, c);
    rc(fb, x + 6, y - 1, 2, 2, PAL.r);
  });
  rc(fb, 68, 20, 56, 1, PAL.r);
  rc(fb, 72, 20, 1, 12, PAL.r);
  rc(fb, 100, 19, 1, 12, PAL.r);
  rc(fb, 46, 48, 100, 4, PAL.N);
  rc(fb, 46, 52, 100, 6, '#3b2314');
  rc(fb, 52, 44, 6, 4, PAL.g);
  newsLamp(fb, frame);
  rc(fb, 96, 36, 16, 4, PAL.w);
  txt(fb, 88, 1, 'NEWS', PAL.r);
};

const title: SceneFn = (fb, w, h, frame) => {
  band(fb, 0, 56, ['#07051a', '#0b0828', '#110c38', '#190f4a', '#241660', '#331d78'], w);
  for (let i = 0; i < 60; i++) px1(fb, Math.floor(rnd(i) * w), Math.floor(rnd(i + 70) * 44), rnd(i + 9) > 0.6 ? WHITE : '#8a93ff');
  cir(fb, 150, 18, 10, '#fff6c8');
  cir(fb, 154, 15, 9, '#190f4a');
  for (let i = 0; i < 18; i++) {
    const bx = i * 11;
    const bh = 14 + Math.floor(rnd(i * 3.3) * 30);
    rc(fb, bx, 64 - bh, 10, bh, '#0a0720');
    for (let j = 0; j < bh / 6; j++) if (rnd(i * 9 + j) > 0.5) rc(fb, bx + 3, 66 - bh + j * 6, 3, 3, PAL.y);
  }
  rc(fb, 0, 64, w, h - 64, '#060414');
  titleGlitch(fb, w, frame);
};

/** v3 `SC` — one painter per scene id. */
export const SC: Readonly<Record<SceneId, SceneFn>> = { meadow, lab, forge, city, news, title };

/**
 * Draw a scene (default 192×80). `frame` 0 = v3 exactly; 1 = ambient variation
 * (identical to 0 for 'meadow'). Unknown ids throw (they are a programming error).
 */
export function drawScene(id: SceneId, w: number = SCENE_W, h: number = SCENE_H, frame: 0 | 1 = 0): FrameBuffer {
  const fn = SC[id];
  if (!fn) throw new Error(`unknown scene ${String(id)}`);
  const fb = createFrameBuffer(w, h);
  fn(fb, w, h, frame === 1 ? 1 : 0);
  return fb;
}
