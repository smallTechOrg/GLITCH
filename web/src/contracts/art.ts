// FROZEN Phase-1 contract (spec/architecture.md → Contracts → art.ts + pixel engine).
import type { IC } from '../art/icons';

export interface FrameBuffer {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray; // RGBA, row-major, w*h*4
  get(x: number, y: number): string; // '#rrggbb' or '' (transparent / out of bounds)
}

export type IconId = keyof typeof IC; // 40 icons from v3 (lines 163–204) + derived heart0, star0
export type SceneId = 'meadow' | 'lab' | 'forge' | 'city' | 'news' | 'title';
export type CharFrame = 'idle' | 'blink' | 'talk' | 'think'; // 'think' only for 'n'

export const SCENE_IDS: readonly SceneId[] = ['meadow', 'lab', 'forge', 'city', 'news', 'title'];
export const SCENE_W = 192;
export const SCENE_H = 80;
export const CHAR_W = 24;
export const CHAR_H = 32;
export const NOVA_H = 28;

// art/characters.ts (A2):  drawCharacter(id: CharacterId, frame?: CharFrame, tick?: number): FrameBuffer
//                          24×32 (NOVA 24×28). `tick` 0..2 = step of animated frames (NOVA 'think').
// art/scenes.ts     (A2):  drawScene(id: SceneId, w?: number, h?: number, frame?: 0|1): FrameBuffer // default 192×80
// art/Icon.tsx:   <Icon name scale outlined? accessibilityLabel? />
// art/Sprite.tsx: <Sprite id scale frame? animate?: 'bob'|'talk'|'none' outlined? crop?: 'head' />
// art/Scene.tsx:  <Scene id style ambient?: boolean filter? />   (ambient frames off under reduced motion)
