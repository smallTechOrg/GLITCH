// AI energy battery (freewrite-forge.md → Energy): 10 pixel segments, "AI ENERGY r/10",
// recharge time, "…" while loading, "?" when the server is unreachable, red at ≤ 2.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { EnergyDTO } from '../contracts/api';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';

export type EnergyState = { kind: 'loading' } | { kind: 'offline' } | ({ kind: 'ok' } & EnergyDTO);

/** Whole hours until `resetsAt` (min 0, rounded up — "RECHARGES IN 3H"). */
export function hoursUntil(resetsAt: string, now: Date): number {
  const t = Date.parse(resetsAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.ceil((t - now.getTime()) / 3_600_000));
}

export function energyLabel(s: EnergyState): string {
  if (s.kind === 'loading') return 'AI energy loading';
  if (s.kind === 'offline') return 'AI energy unknown, NOVA is offline';
  return `AI energy ${s.remaining} of ${s.limit}`;
}

export interface EnergyMeterProps {
  state: EnergyState;
  now?: Date;
  testID?: string;
  segments?: number;
}

export function EnergyMeter({ state, now = new Date(), testID = 'fw-energy', segments = 10 }: EnergyMeterProps): React.JSX.Element {
  const lit = state.kind === 'ok' ? Math.max(0, Math.min(segments, Math.round((state.remaining / Math.max(1, state.limit)) * segments))) : 0;
  const low = state.kind === 'ok' && state.remaining <= 2;
  const fill = low ? colors.no : colors.ok;
  const readout = state.kind === 'loading' ? '…' : state.kind === 'offline' ? '?' : `${state.remaining}/${state.limit}`;
  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={energyLabel(state)} style={styles.wrap}>
      <PixelText size={fontSize.tiny} color={colors.mu}>AI ENERGY</PixelText>
      <View style={styles.battery}>
        {Array.from({ length: segments }, (_, i) => (
          <View key={i} style={[styles.seg, state.kind === 'ok' && i < lit ? { backgroundColor: fill } : null, state.kind === 'loading' ? styles.segLoading : null]} />
        ))}
        <View style={styles.nub} />
      </View>
      <PixelText size={fontSize.small} color={low ? colors.no : colors.tx}>{readout}</PixelText>
      {state.kind === 'ok' && state.remaining <= 0 ? (
        <PixelText size={fontSize.tiny} color={colors.mu}>{`RECHARGES IN ${hoursUntil(state.resetsAt, now)}H`}</PixelText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  battery: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2, borderWidth: border.thin, borderColor: colors.ln, backgroundColor: colors.deep },
  seg: { width: 6, height: 12, backgroundColor: colors.bg2 },
  segLoading: { backgroundColor: colors.ln },
  nub: { width: 3, height: 6, backgroundColor: colors.ln, marginLeft: 2 },
});
