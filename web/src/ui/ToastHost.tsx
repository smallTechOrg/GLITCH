// Renders the current toast (testID `toast`) as a polite live region; pops in 0.25 s steps(3).
import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ANIM } from '../a11y/stepped';
import { useStepAnimation } from '../a11y/useStepAnimation';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';
import { useToastStore } from './toast';

export function ToastHost(): React.JSX.Element {
  const current = useToastStore((s) => s.current);
  const v = useStepAnimation({ ...ANIM.toastPop, trigger: current?.id });
  return (
    <View pointerEvents="none" style={styles.host} accessibilityLiveRegion="polite" aria-live="polite">
      {current ? (
        <Animated.View
          key={current.id}
          testID="toast"
          accessibilityRole="alert"
          style={[styles.toast, { transform: [{ scale: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.4, 1.1, 1] }) }] }]}
        >
          <PixelText size={fontSize.small} color={colors.ink}>{current.text}</PixelText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center', zIndex: 300 },
  toast: { backgroundColor: colors.ac, borderWidth: border.width, borderColor: colors.white, paddingVertical: 10, paddingHorizontal: 14, maxWidth: '92%' },
});
