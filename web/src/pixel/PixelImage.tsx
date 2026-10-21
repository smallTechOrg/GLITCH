// Renders a memoised framebuffer PNG with nearest-neighbour scaling on every platform:
// web → CSS `image-rendering: pixelated`; native → integer pre-upscale baked into the PNG.
import React, { useMemo } from 'react';
import { Image, Platform, type ImageStyle, type StyleProp } from 'react-native';
import type { FrameBuffer } from '../contracts/art';
import { pixelAsset } from './png';

export interface PixelImageProps {
  /** Unique memo key for this artwork (e.g. 'ic:heart', 'sc:lab:0'). */
  cacheKey: string;
  draw: () => FrameBuffer;
  /** Integer display scale (display size = source px × scale) unless width/height given. */
  scale?: number;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  resizeMode?: 'cover' | 'contain' | 'stretch';
  style?: StyleProp<ImageStyle>;
  /** Pixel images are decorative unless labelled (hearts, stars, lever chips, energy). */
  accessibilityLabel?: string;
  testID?: string;
}

const WEB_PIXELATED = Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as unknown as ImageStyle) : null;

export function PixelImage({
  cacheKey,
  draw,
  scale = 1,
  width,
  height,
  resizeMode = 'stretch',
  style,
  accessibilityLabel,
  testID,
}: PixelImageProps): React.JSX.Element {
  const s = Math.max(1, Math.floor(scale));
  const bake = Platform.OS === 'web' ? 1 : Math.min(s, 8);
  // `draw` is intentionally not a dependency: the cache key identifies the artwork.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const asset = useMemo(() => pixelAsset(cacheKey, draw, bake), [cacheKey, bake]);
  const labelled = !!accessibilityLabel;
  return (
    <Image
      testID={testID}
      source={{ uri: asset.uri, width: asset.w * asset.scale, height: asset.h * asset.scale }}
      resizeMode={resizeMode}
      fadeDuration={0}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
      aria-hidden={!labelled}
      style={[{ width: width ?? asset.w * s, height: height ?? asset.h * s }, WEB_PIXELATED, style]}
    />
  );
}
