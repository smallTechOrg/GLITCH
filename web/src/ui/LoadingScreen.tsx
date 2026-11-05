// App-start state while fonts + on-device store hydrate (spec/ui.md → four states).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fontSize } from '../theme/tokens';
import { GlitchLogo } from './GlitchLogo';
import { PixelText } from './PixelText';

export function LoadingScreen(): React.JSX.Element {
  return (
    <View testID="app-loading" style={styles.wrap} accessibilityLiveRegion="polite">
      <GlitchLogo size={fontSize.h1} shadow={4} accessibilityRole="header" />
      <PixelText size={fontSize.small} color={colors.mu}>LOADING…</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 },
});
