// SCAFFOLD STUB — slice A2 replaces this file with the faithful port of v3 `SC.*`
// (spec/GLITCH v3.html lines 249–278) plus 2-frame ambient overlays. The stub paints a
// correctly sized sky/ground silhouette in each scene's palette.
import { SCENE_H, SCENE_W, type FrameBuffer, type SceneId } from '../contracts/art';
import { createFrameBuffer } from '../pixel/framebuffer';
import { band, rc } from '../pixel/primitives';

const STUB_COLORS: Readonly<Record<SceneId, { sky: readonly string[]; ground: string }>> = {
  meadow: { sky: ['#2f8fff', '#4aa3ff', '#66b5ff', '#85c6ff'], ground: '#2f8f4a' },
  lab: { sky: ['#0d2531', '#123546'], ground: '#07161d' },
  forge: { sky: ['#2a1a16', '#3a2620'], ground: '#1a0f0c' },
  city: { sky: ['#0a0722', '#170f40', '#2c1b66', '#3b2278'], ground: '#0d0a24' },
  news: { sky: ['#14261f', '#1b3329'], ground: '#0d1a15' },
  title: { sky: ['#07051a', '#110c38', '#241660', '#331d78'], ground: '#060414' },
};

export function drawScene(id: SceneId, w: number = SCENE_W, h: number = SCENE_H, frame: 0 | 1 = 0): FrameBuffer {
  void frame;
  const fb = createFrameBuffer(w, h);
  const c = STUB_COLORS[id];
  band(fb, 0, Math.round(h * 0.75), c.sky, w);
  rc(fb, 0, Math.round(h * 0.75), w, h, c.ground);
  return fb;
}
