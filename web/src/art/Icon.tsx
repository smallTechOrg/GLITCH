// <Icon name scale outlined? accessibilityLabel? /> — v3 `ico()` (line 208) on the pixel engine.
import React from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import type { FrameBuffer, IconId } from '../contracts/art';
import { outline } from '../pixel/framebuffer';
import { drawGrid } from '../pixel/grid';
import { PixelImage } from '../pixel/PixelImage';
import { IC } from './icons';

export interface IconProps {
  name: IconId;
  scale?: number; // v3 default 4 → 48 px
  outlined?: boolean; // 1 px white sticker outline (v3 `.stk`)
  accessibilityLabel?: string; // set only when the icon conveys state
  style?: StyleProp<ImageStyle>;
  testID?: string;
}

export function iconBuffer(name: IconId, outlined = false): FrameBuffer {
  const fb = drawGrid(IC[name] ?? IC.question);
  return outlined ? outline(fb) : fb;
}

export function Icon({ name, scale = 4, outlined = false, accessibilityLabel, style, testID }: IconProps): React.JSX.Element {
  return (
    <PixelImage
      cacheKey={`ic:${name}:${outlined ? 'o' : '-'}`}
      draw={() => iconBuffer(name, outlined)}
      scale={scale}
      accessibilityLabel={accessibilityLabel}
      style={style}
      testID={testID}
    />
  );
}
