// v3 `.say` speech bubble: white / pink (bad) / green (good), pops on change; polite live region.
import React from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { Mood } from '../contracts/ids';
import { ANIM } from '../a11y/stepped';
import { useStepAnimation } from '../a11y/useStepAnimation';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';

export interface SpeechBubbleProps {
  text: string;
  mood?: Mood;
  /** Bump to replay the pop even when the text repeats. */
  version?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode; // e.g. the ASK NOVA WHY stub chip
}

const BG: Record<Mood, string> = { neutral: colors.sayBg, bad: colors.sayBad, good: colors.sayGood };

export function SpeechBubble({ text, mood = 'neutral', version = 0, testID = 'say-bubble', style, children }: SpeechBubbleProps): React.JSX.Element {
  const v = useStepAnimation({ ...ANIM.sayPop, trigger: `${version}:${text}` });
  const scale = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.6, 1.08, 1] });
  return (
    <Animated.View testID={testID} accessibilityLiveRegion="polite" aria-live="polite" style={[styles.say, { backgroundColor: BG[mood], transform: [{ scale }] }, style]}>
      <PixelText long size={fontSize.small} color={colors.ink}>{text}</PixelText>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  say: { padding: 10, borderWidth: border.width, borderColor: colors.ink, minHeight: 40 },
});
