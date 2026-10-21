// Deep link into a locked step/module (spec/ui.md): message + Home button — never a crash.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '../art/Icon';
import { colors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { LOCKED } from './copy';
import { goHome } from './nav';

export function LockedScreen(): React.JSX.Element {
  return (
    <Page testID="locked-screen">
      <View style={styles.wrap}>
        <Icon name="lock" scale={8} />
        <PixelText size={fontSize.h2} color={colors.ac} accessibilityRole="header">{LOCKED.title}</PixelText>
        <PixelText long color={colors.mu} style={styles.center}>{LOCKED.text}</PixelText>
        <PixelButton testID="locked-home" variant="primary" label={LOCKED.home} onPress={goHome} />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 16, paddingVertical: 40 },
  center: { textAlign: 'center' },
});
