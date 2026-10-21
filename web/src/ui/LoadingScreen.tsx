// App-start state while fonts + on-device store hydrate (spec/ui.md → four states).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';

export function LoadingScreen(): React.JSX.Element {
  return (
    <View testID="app-loading" style={styles.wrap} accessibilityLiveRegion="polite">
      <PixelText size={fontSize.h1} color={colors.ac} style={styles.logo} accessibilityRole="header">GLITCH</PixelText>
      <PixelText size={fontSize.small} color={colors.mu}>LOADING…</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 },
  logo: { textShadowColor: colors.logoShadow, textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
});
