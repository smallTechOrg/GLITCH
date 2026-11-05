// v3 `metric()` (line 502): label, value%, goal ≥/≤ target, bar with target marker.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { IconId } from '../contracts/art';
import { Icon } from '../art/Icon';
import { border, colors, fontSize } from '../theme/tokens';
import { Bar } from './Bar';
import { PixelText } from './PixelText';

export type MetricDirection = 1 | -1; // 1: goal ≥ target, -1: goal ≤ target

/** v3: ok = dir>0 ? v ≥ tg : v ≤ tg (unrounded). */
export const metricOk = (value: number, target: number, dir: MetricDirection): boolean => (dir > 0 ? value >= target : value <= target);

export interface MetricBarProps {
  id: string; // testID metric-<id>
  label: string;
  value: number;
  target: number;
  direction: MetricDirection;
  icon?: IconId;
  unit?: string; // default '%'
}

export function MetricBar({ id, label, value, target, direction, icon = 'target', unit = '%' }: MetricBarProps): React.JSX.Element {
  const ok = metricOk(value, target, direction);
  const shown = Math.round(value);
  const goal = `goal ${direction > 0 ? '≥' : '≤'}${target}`;
  return (
    <View testID={`metric-${id}`} accessible accessibilityLabel={`${label} ${shown}${unit}, ${goal}, ${ok ? 'met' : 'not met'}`} style={[styles.box, ok ? styles.ok : null]}>
      <View style={styles.row}>
        <Icon name={icon} scale={2} />
        <PixelText size={fontSize.tiny} bold>{label}</PixelText>
        <View style={styles.spacer} />
        <PixelText size={fontSize.tiny}>{`${shown}${unit} `}</PixelText>
        <PixelText size={fontSize.tiny} color={colors.mu}>{goal}</PixelText>
        <PixelText size={fontSize.tiny} color={ok ? colors.ok : colors.no}>{ok ? ' OK' : ' NO'}</PixelText>
      </View>
      <Bar value={value / 100} marker={target / 100} height={5} color={ok ? colors.ok : colors.bl} style={styles.bar} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 1, paddingHorizontal: 6, backgroundColor: colors.cd, borderWidth: border.thin, borderColor: colors.ln },
  ok: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spacer: { flex: 1 },
  bar: { marginTop: 2 },
});
