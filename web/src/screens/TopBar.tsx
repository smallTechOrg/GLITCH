// PLACEHOLDER (slice A1 replaces): sticky top bar with logo, HOME and SETTINGS.
import React from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { HOME_HREF, SETTINGS_HREF } from '../contracts/routes';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';

export function TopBar(): React.JSX.Element {
  return (
    <View testID="topbar" style={styles.bar} accessibilityRole="toolbar">
      <PixelText size={fontSize.logo} color={colors.ac} style={styles.logo} onPress={() => router.navigate(HOME_HREF)} accessibilityRole="link" accessibilityLabel="GLITCH home">
        GLITCH
      </PixelText>
      <PixelButton testID="topbar-home" variant="small" label="HOME" onPress={() => router.navigate(HOME_HREF)} />
      <View style={styles.spacer} />
      <PixelButton testID="topbar-settings" variant="small" label="SETTINGS" icon="gear" onPress={() => router.navigate(SETTINGS_HREF)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, flexWrap: 'wrap',
    backgroundColor: colors.deep, borderBottomWidth: border.width, borderBottomColor: colors.ln, zIndex: 50,
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as unknown as ViewStyle) : {}),
  },
  logo: { textShadowColor: colors.logoShadow, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  spacer: { flex: 1 },
});
