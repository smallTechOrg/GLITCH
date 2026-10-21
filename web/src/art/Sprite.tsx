// <Sprite id scale frame? animate?: 'bob'|'talk'|'none' outlined? /> — characters on the pixel engine.
import React from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import type { CharacterId } from '../contracts/ids';
import type { CharFrame, FrameBuffer } from '../contracts/art';
import { crop, outline } from '../pixel/framebuffer';
import { PixelImage } from '../pixel/PixelImage';
import { ANIM, BLINK_EVERY_MS, BLINK_MS, BOB_PX, NOVA_THINK_FPS, TALK_FPS } from '../a11y/stepped';
import { bobTransform, useFrameCycle, usePulse, useStepAnimation } from '../a11y/useStepAnimation';
import { drawCharacter } from './characters';

export type SpriteAnimate = 'bob' | 'talk' | 'none';

export interface SpriteProps {
  id: CharacterId;
  scale?: number;
  frame?: CharFrame; // base frame (default idle)
  animate?: SpriteAnimate;
  outlined?: boolean;
  /** 'head' = v3 `head()` 14×14 face crop (top bar, module cards). */
  crop?: 'full' | 'head';
  /** Bob start offset in ms (v3 staggers the welcome banner by 0.25 s). */
  delayMs?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function spriteBuffer(id: CharacterId, frame: CharFrame, tick: number, outlined: boolean, part: 'full' | 'head'): FrameBuffer {
  let fb = drawCharacter(id, frame, tick);
  if (part === 'head') fb = crop(fb, 5, id === 'n' ? 3 : 1, 14, 14);
  return outlined ? outline(fb) : fb;
}

export function Sprite({
  id,
  scale = 4,
  frame = 'idle',
  animate = 'none',
  outlined = false,
  crop: part = 'full',
  delayMs,
  accessibilityLabel,
  style,
  testID,
}: SpriteProps): React.JSX.Element {
  const moving = animate !== 'none';
  const talkTick = useFrameCycle(2, TALK_FPS, animate === 'talk');
  const thinkTick = useFrameCycle(3, NOVA_THINK_FPS, frame === 'think' && id === 'n');
  const blink = usePulse(BLINK_EVERY_MS, BLINK_MS, moving && frame === 'idle');
  const shown: CharFrame = frame !== 'idle' ? frame : animate === 'talk' && talkTick === 1 ? 'talk' : blink ? 'blink' : 'idle';
  const tick = frame === 'think' ? thinkTick : 0;
  const timing = animate === 'talk' ? ANIM.bobFast : ANIM.bob;
  const v = useStepAnimation({ ...timing, loop: true, play: moving, delayMs });
  return (
    <Animated.View testID={testID} style={[moving ? bobTransform(v, BOB_PX) : null, style]}>
      <PixelImage
        cacheKey={`ch:${id}:${shown}:${tick}:${outlined ? 'o' : '-'}:${part}`}
        draw={() => spriteBuffer(id, shown, tick, outlined, part)}
        scale={scale}
        accessibilityLabel={accessibilityLabel}
      />
    </Animated.View>
  );
}
