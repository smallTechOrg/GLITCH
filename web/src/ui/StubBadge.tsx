// Shared look for Phase-1 LABELLED STUBS (spec/ui.md → STUBS): dimmed, dashed border,
// yellow "SOON" tag, disabled, hint "Coming in a future update".
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';
import { Tag } from './Tag';

export const STUB_HINT = 'Coming in a future update';

export interface StubBadgeProps {
  label: string;
  testID: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

export function StubBadge({ label, testID, hint = STUB_HINT, style }: StubBadgeProps): React.JSX.Element {
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}, soon`}
      accessibilityHint={hint}
      accessibilityState={{ disabled: true }}
      aria-disabled
      style={[styles.stub, style]}
    >
      <PixelText size={fontSize.tiny} color={colors.mu}>{label}</PixelText>
      <Tag label="SOON" variant="soon" />
    </View>
  );
}

const styles = StyleSheet.create({
  stub: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingVertical: 6, paddingHorizontal: 10, borderWidth: border.thin, borderStyle: 'dashed', borderColor: colors.mu, opacity: 0.7, alignSelf: 'flex-start' },
});
