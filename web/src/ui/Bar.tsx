// v3 `.bar` progress bar (XP, module progress): dark trough, green fill, optional target marker.
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { border, colors } from '../theme/tokens';

export interface BarProps {
  value: number; // 0..1
  color?: string;
  height?: number;
  marker?: number; // 0..1 target marker (v3 `u`)
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function Bar({ value, color = colors.ok, height = 10, marker, accessibilityLabel, testID, style }: BarProps): React.JSX.Element {
  const pct = clamp01(value) * 100;
  return (
    <View
      testID={testID}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityLabel ? { min: 0, max: 100, now: Math.round(pct) } : undefined}
      aria-valuemin={accessibilityLabel ? 0 : undefined}
      aria-valuemax={accessibilityLabel ? 100 : undefined}
      aria-valuenow={accessibilityLabel ? Math.round(pct) : undefined}
      style={[styles.trough, { height: height + border.thin * 2 }, style]}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      {marker !== undefined ? <View style={[styles.marker, { left: `${clamp01(marker) * 100}%` }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trough: { backgroundColor: colors.deep, borderWidth: border.thin, borderColor: colors.ln, position: 'relative', overflow: 'visible' },
  fill: { height: '100%' },
  marker: { position: 'absolute', top: -4, width: 3, height: 18, backgroundColor: colors.ac },
});
