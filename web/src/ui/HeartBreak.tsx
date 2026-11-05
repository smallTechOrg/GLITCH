// A heart cracks in two and falls apart over the activity when a heart is lost. Each new
// `count` replays it. Nothing renders under reduced motion: the HUD hearts still update.
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ANIM } from '../a11y/stepped';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useStepAnimation } from '../a11y/useStepAnimation';
import { Icon } from '../art/Icon';
import { colors } from '../theme/tokens';

const SCALE = 10;
const SIZE = 12 * SCALE;
const SHARDS: readonly (readonly [number, number])[] = [[-70, -40], [70, -50], [-90, 20], [90, 30], [-40, 80], [50, 90]];

export function HeartBreak({ count }: { count: number }): React.JSX.Element | null {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const v = useStepAnimation({ ...ANIM.heartbreak, trigger: count, play: count > 0 && !reduced, restValue: 1 });

  useEffect(() => {
    if (count === 0 || reduced) return undefined;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), ANIM.heartbreak.durationMs + 60);
    return () => clearTimeout(t);
  }, [count, reduced]);

  if (!visible) return null;

  const split = v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0, 1] });
  const half = (dir: 1 | -1) => ({
    transform: [
      { translateX: split.interpolate({ inputRange: [0, 1], outputRange: [0, dir * 54] }) },
      { translateY: split.interpolate({ inputRange: [0, 1], outputRange: [0, 70] }) },
      { rotate: split.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${dir * 28}deg`] }) },
    ],
  });
  return (
    <View testID="heartbreak" pointerEvents="none" style={styles.layer} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.heart, { opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }) }]}>
        <Animated.View style={[styles.half, half(-1)]}>
          <Icon name="heart" scale={SCALE} />
        </Animated.View>
        <Animated.View style={[styles.half, half(1)]}>
          <View style={styles.shift}>
            <Icon name="heart" scale={SCALE} />
          </View>
        </Animated.View>
        {SHARDS.map(([x, y], i) => (
          <Animated.View
            key={i}
            style={[
              styles.shard,
              { opacity: split.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 0] }) },
              {
                transform: [
                  { translateX: split.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
                  { translateY: split.interpolate({ inputRange: [0, 1], outputRange: [0, y] }) },
                ],
              },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 300 },
  heart: { width: SIZE, height: SIZE, flexDirection: 'row' },
  half: { width: SIZE / 2, height: SIZE, overflow: 'hidden' },
  shift: { marginLeft: -SIZE / 2 },
  shard: { position: 'absolute', left: SIZE / 2 - 5, top: SIZE / 2 - 5, width: 10, height: 10, backgroundColor: colors.no },
});
