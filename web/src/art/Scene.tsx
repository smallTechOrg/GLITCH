// <Scene id style ambient?: boolean /> — procedural backgrounds; ambient frames off under reduced motion.
import React from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { SCENE_H, SCENE_W, type FrameBuffer, type SceneId } from '../contracts/art';
import { mapColors } from '../pixel/framebuffer';
import { PixelImage } from '../pixel/PixelImage';
import { AMBIENT_FPS } from '../a11y/stepped';
import { useFrameCycle } from '../a11y/useStepAnimation';
import { drawScene } from './scenes';

/** v3 CSS filters reproduced in pixels: locked = grayscale(1) brightness(.4); dim = brightness(.35); half = brightness(.5). */
export type SceneFilter = 'none' | 'locked' | 'dim' | 'half';

const BRIGHT: Record<SceneFilter, number> = { none: 1, locked: 0.4, dim: 0.35, half: 0.5 };

export interface SceneProps {
  id: SceneId;
  style?: StyleProp<ImageStyle>;
  ambient?: boolean;
  filter?: SceneFilter;
  w?: number;
  h?: number;
  testID?: string;
}

export function sceneBuffer(id: SceneId, w: number, h: number, frame: 0 | 1, filter: SceneFilter): FrameBuffer {
  const fb = drawScene(id, w, h, frame);
  if (filter === 'none') return fb;
  const k = BRIGHT[filter];
  return mapColors(fb, (r, g, b) => {
    if (filter === 'locked') {
      const y = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * k);
      return [y, y, y];
    }
    return [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
  });
}

export function Scene({ id, style, ambient = false, filter = 'none', w = SCENE_W, h = SCENE_H, testID }: SceneProps): React.JSX.Element {
  const frame = useFrameCycle(2, AMBIENT_FPS, ambient) as 0 | 1;
  return (
    <PixelImage
      cacheKey={`sc:${id}:${w}x${h}:${frame}:${filter}`}
      draw={() => sceneBuffer(id, w, h, frame, filter)}
      width="100%"
      height="100%"
      resizeMode="cover"
      style={style}
      testID={testID}
    />
  );
}
