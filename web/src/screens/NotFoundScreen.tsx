// "LOST IN THE GRID" + Home button (spec/ui.md → +not-found). Slice A1 may restyle.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HOME_HREF } from '../contracts/routes';
import { Icon } from '../art/Icon';
import { colors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';

export function NotFoundScreen(): React.JSX.Element {
  return (
    <Page testID="not-found-screen">
      <View style={styles.wrap}>
        <Icon name="question" scale={8} />
        <PixelText size={fontSize.h2} color={colors.ac} accessibilityRole="header">LOST IN THE GRID</PixelText>
        <PixelText long color={colors.mu}>That page does not exist.</PixelText>
        <PixelButton testID="not-found-home" variant="primary" label="← Home" onPress={() => router.replace(HOME_HREF)} />
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', gap: 16, paddingVertical: 40 } });
