// v3 `.chip`: small bordered pill with optional icon (streak, XP, power chips, lever chips).
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconId } from '../contracts/art';
import { Icon } from '../art/Icon';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';

export interface ChipProps {
  label?: string;
  icon?: IconId;
  color?: string; // text colour
  borderColor?: string;
  background?: string;
  dim?: boolean; // dark/unlit state (lever missed)
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Chip({ label, icon, color = colors.tx, borderColor = colors.ln, background = colors.cd, dim, accessibilityLabel, testID, style, children }: ChipProps): React.JSX.Element {
  return (
    <View
      testID={testID}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={[styles.chip, { borderColor, backgroundColor: background }, dim ? styles.dim : null, style]}
    >
      {icon ? <Icon name={icon} scale={2} /> : null}
      {label ? <PixelText size={fontSize.tiny} color={color}>{label}</PixelText> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, borderWidth: border.thin },
  dim: { opacity: 0.45 },
});
