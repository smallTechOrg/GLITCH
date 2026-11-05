// The GLITCH wordmark. Every few seconds it tears: colour channels split and a slice slips
// sideways for a few stepped frames. Static under reduced motion.
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { pixelText } from '../theme/fonts';
import { colors, fontSize, lineHeightFor } from '../theme/tokens';

/** One torn frame, in px at the logo's base size: main x, cyan x, pink x, slice x. */
const FRAMES: readonly (readonly [number, number, number, number])[] = [
  [1, -2, 2, 3],
  [-2, 2, -2, -4],
  [0, -3, 3, 0],
  [2, 2, -3, 5],
  [-1, -3, 2, -3],
  [0, 1, -1, 2],
];
export const GLITCH_FRAME_MS = 70;
export const GLITCH_REST_MS = 2800;

export interface GlitchLogoProps {
  size?: number;
  /** Depth of the hard drop shadow. */
  shadow?: number;
  color?: string;
  accessibilityRole?: 'header';
  testID?: string;
}

export function GlitchLogo({ size = fontSize.logo, shadow = 2, color = colors.ac, accessibilityRole, testID }: GlitchLogoProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(-1);

  useEffect(() => {
    if (reduced) {
      setFrame(-1);
      return undefined;
    }
    let t: ReturnType<typeof setTimeout>;
    const tick = (i: number): void => {
      const next = i + 1 >= FRAMES.length ? -1 : i + 1;
      setFrame(next);
      t = setTimeout(() => tick(next), next === -1 ? GLITCH_REST_MS : GLITCH_FRAME_MS);
    };
    t = setTimeout(() => tick(-1), GLITCH_REST_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  const f = frame >= 0 ? FRAMES[frame] : undefined;
  const k = size / fontSize.logo;
  const base = pixelText(size);
  const sliceTop = Math.round(lineHeightFor(size) * 0.42);
  return (
    <View testID={testID} style={styles.wrap}>
      <Text
        accessibilityRole={accessibilityRole}
        style={[base, { color, textShadowColor: colors.logoShadow, textShadowOffset: { width: shadow, height: shadow }, textShadowRadius: 0, transform: [{ translateX: Math.abs(f?.[0] ?? 0) * k }] }]}
      >
        GLITCH
      </Text>
      {f ? (
        <View style={[StyleSheet.absoluteFill, styles.burst]} pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={[base, styles.ghost, { color: colors.bl, transform: [{ translateX: f[1] * k }] }]}>GLITCH</Text>
          <Text style={[base, styles.ghost, { color: colors.pk, transform: [{ translateX: f[2] * k }] }]}>GLITCH</Text>
          <View style={[styles.slice, { top: sliceTop, height: Math.round(lineHeightFor(size) * 0.18) }]}>
            <Text style={[base, styles.ghost, { color: colors.white, top: -sliceTop, transform: [{ translateX: f[3] * k }] }]}>GLITCH</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center' },
  ghost: { position: 'absolute', left: 0, opacity: 0.8 },
  // Clipped to the logo box so a torn frame never pokes past the screen edge.
  burst: { overflow: 'hidden' },
  slice: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
});
