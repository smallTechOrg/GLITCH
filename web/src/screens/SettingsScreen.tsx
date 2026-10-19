// PLACEHOLDER (slice A1 replaces): nickname, readable font, reset progress, privacy note.
import React from 'react';
import { colors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelText } from '../ui/PixelText';
import { PlaceholderNote } from './PlaceholderNote';

export function SettingsScreen(): React.JSX.Element {
  return (
    <Page testID="settings-screen">
      <PixelText size={fontSize.h2} color={colors.ac} accessibilityRole="header">SETTINGS</PixelText>
      <PixelText long color={colors.mu}>Everything saves on this device. NOVA&apos;s server never keeps what you type.</PixelText>
      <PlaceholderNote what="Settings" />
    </Page>
  );
}
