// v3 screen wipe (`go()`, 0.8 s steps(8)): the new screen steps in from black. Re-keyed per
// route by app/_layout.tsx; skipped entirely under reduced motion.
import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { ANIM } from '../a11y/stepped';
import { useStepAnimation } from '../a11y/useStepAnimation';

export interface ScreenWipeProps {
  routeKey: string;
  children: React.ReactNode;
}

export function ScreenWipe({ routeKey, children }: ScreenWipeProps): React.JSX.Element {
  // Second half of v3's wipe (60%→100% opacity ramp) on the incoming screen: 4 of 8 steps.
  const v = useStepAnimation({ durationMs: ANIM.wipe.durationMs / 2, steps: ANIM.wipe.steps / 2, trigger: routeKey });
  return <Animated.View style={[styles.fill, { opacity: v }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
