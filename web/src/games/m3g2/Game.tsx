// m3g2 · Fairness Lab — render + wiring only (v3 lines 558–568). Maths/audit/powers live
// in logic.ts; copy in data.ts.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { border, colors, fontSize, space } from '../../theme/tokens';
import { MetricBar } from '../../ui/MetricBar';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { ToggleTile } from '../../ui/ToggleTile';
import {
  ACCURACY_GOAL, ACCURACY_LABEL, AUDIT_A11Y_LABEL, AUDIT_LABEL, BAR_PX_PER_PCT, FEATURES, FLASH_MS, GAP_GOAL, GAP_LABEL,
  HEADING, MEN_LABEL, MEN_SHORTLISTED, RULE_LINE, WIN_DELAY_MS, WIN_SUMMARY, WOMEN_LABEL, focusLine,
  xrayLine, type FeatureId,
} from './data';
import { audit, auditMistake, calc, focusTarget, initialOn, toggle, womenShortlisted, xrayFix, type OnMap } from './logic';

export function FairnessLabGame({ api }: { api: GameApi }): React.JSX.Element {
  const [on, setOn] = useState<OnMap>(initialOn);
  const [flash, setFlash] = useState<FeatureId | null>(null);
  const [passed, setPassed] = useState(false);
  const onRef = useRef(on);
  const passedRef = useRef(false);
  const apiRef = useRef(api);
  apiRef.current = api;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const commit = useCallback((next: OnMap) => {
    onRef.current = next;
    setOn(next);
  }, []);

  const locked = (): boolean => apiRef.current.over || passedRef.current;

  const onToggle = useCallback(
    (id: FeatureId) => {
      if (locked()) return;
      commit(toggle(onRef.current, id));
    },
    [commit],
  );

  const onAudit = useCallback(() => {
    if (locked()) return;
    const r = audit(onRef.current);
    if (r.pass) {
      passedRef.current = true;
      setPassed(true);
      apiRef.current.say(r.message, 'good');
      timers.current.push(setTimeout(() => apiRef.current.win(WIN_SUMMARY), WIN_DELAY_MS));
    } else apiRef.current.miss(r.message, auditMistake(onRef.current));
  }, []);

  useEffect(() => {
    api.registerPowers({
      scan: () => {
        if (passedRef.current) return false;
        const r = xrayFix(onRef.current);
        if (!r) return false;
        commit(r.on);
        apiRef.current.say(xrayLine(r.name), 'good');
        return true;
      },
      hint: () => {
        if (passedRef.current) return false;
        const t = focusTarget(onRef.current);
        if (!t) return false;
        setFlash(t.id);
        timers.current.push(setTimeout(() => setFlash((f) => (f === t.id ? null : f)), FLASH_MS));
        apiRef.current.say(focusLine(t.name), 'good');
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const m = calc(on);
  const women = womenShortlisted(m);
  const disabled = api.over || passed;

  return (
    <View style={styles.root}>
      <PixelText size={fontSize.h3} color={colors.ac} accessibilityRole="header">{HEADING}</PixelText>
      <PixelText long size={fontSize.small} color={colors.mu}>{RULE_LINE}</PixelText>
      <View style={styles.toggles}>
        {FEATURES.map(([id, name, kind]) => (
          <ToggleTile
            key={id}
            id={id}
            label={name}
            on={on[id]}
            icon={kind === 's' ? 'check' : 'mask'}
            flash={flash === id}
            disabled={disabled}
            onToggle={() => onToggle(id)}
            style={styles.toggle}
          />
        ))}
      </View>
      <View style={styles.chart}>
        <GroupBar testID="m3g2-men" label={MEN_LABEL} pct={MEN_SHORTLISTED} color={colors.bl} />
        <GroupBar testID="m3g2-women" label={WOMEN_LABEL} pct={women} color={colors.pk} />
      </View>
      <MetricBar id="gap" label={GAP_LABEL} value={m.gap} target={GAP_GOAL} direction={-1} icon="scales" />
      <MetricBar id="accuracy" label={ACCURACY_LABEL} value={m.accuracy} target={ACCURACY_GOAL} direction={1} icon="target" />
      <PixelButton testID="m3g2-audit" label={AUDIT_LABEL} variant="primary" onPress={onAudit} disabled={disabled} accessibilityLabel={AUDIT_A11Y_LABEL} />
    </View>
  );
}

function GroupBar({ testID, label, pct, color }: { testID: string; label: string; pct: number; color: string }): React.JSX.Element {
  return (
    <View testID={testID} accessible accessibilityLabel={`${label} ${pct}%`} style={styles.col}>
      <PixelText size={fontSize.tiny} color={colors.mu} style={styles.colLabel}>{label}</PixelText>
      <View style={styles.track}>
        <View style={[styles.fill, { height: Math.max(0, pct) * BAR_PX_PER_PCT, backgroundColor: color }]} />
      </View>
      <PixelText size={fontSize.ui} bold>{`${pct}%`}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  toggle: { flexGrow: 1, flexBasis: 220 },
  chart: { flexDirection: 'row', justifyContent: 'center', columnGap: space.xxl, rowGap: space.md, paddingVertical: space.md },
  // Columns shrink (labels wrap) so the chart fits a 320 px screen.
  col: { alignItems: 'center', gap: space.xs, flexShrink: 1, minWidth: 0 },
  colLabel: { textAlign: 'center' },
  track: { width: 56, height: MEN_SHORTLISTED * BAR_PX_PER_PCT, justifyContent: 'flex-end', borderBottomWidth: border.thin, borderColor: colors.ln },
  fill: { width: '100%' },
});
