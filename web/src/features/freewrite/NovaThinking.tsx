// NOVA "thinking" while the evaluation runs: NOVA's `think` frames (antenna cycles, eyes
// scan; 3 frames at 6 fps) + "NOVA IS THINKING…". Reduced motion → one static frame, no
// cycling dots; the state is still announced (spec/ui.md → Reduced motion).
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { announce } from '../../a11y/announce';
import { NOVA_THINK_FPS } from '../../a11y/stepped';
import { useFrameCycle } from '../../a11y/useStepAnimation';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { Sprite } from '../../art/Sprite';
import { colors, fontSize } from '../../theme/tokens';
import { PixelText } from '../../ui/PixelText';
import { COPY } from './data';

export interface NovaThinkingProps {
  /** The game's reduced-motion flag (OS setting is read live as well). */
  reducedMotion?: boolean;
}

export function NovaThinking({ reducedMotion = false }: NovaThinkingProps): React.JSX.Element {
  const osReduced = useReducedMotion();
  const still = reducedMotion || osReduced;
  const dots = useFrameCycle(3, NOVA_THINK_FPS, !still);
  useEffect(() => {
    announce(COPY.thinking);
  }, []);
  return (
    <View
      testID="fw-thinking"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={COPY.thinking}
      accessibilityLiveRegion="polite"
      aria-busy
      style={styles.wrap}
    >
      {still ? (
        <Sprite id="n" frame="think" scale={3} testID="fw-thinking-static" />
      ) : (
        <Sprite id="n" frame="think" scale={3} testID="fw-thinking-anim" />
      )}
      <View style={styles.text}>
        <PixelText size={fontSize.small} color={colors.bl}>{COPY.thinking}</PixelText>
        {still ? null : (
          <View style={styles.dots} accessible={false}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.dot, i <= dots ? styles.dotOn : null]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 },
  text: { gap: 6 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, backgroundColor: colors.ln },
  dotOn: { backgroundColor: colors.bl },
});
