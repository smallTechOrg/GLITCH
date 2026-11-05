// m4g3 · Design the Companion — render + wiring only (v3 lines 581–592). Maths in logic.ts.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { colors, fontSize, layout } from '../../theme/tokens';
import { MetricBar } from '../../ui/MetricBar';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { Slider } from '../../ui/Slider';
import { ToggleTile } from '../../ui/ToggleTile';
import {
  HEADING, METRICS, SHIPPED_LINE, SHIP_LABEL, SLIDERS, SLIDER_MAX, SLIDER_MIN, START_DESIGN, SUMMARY, TOGGLES, WIN_DELAY_MS, XRAY_DESIGN, XRAY_LINE,
  type Design, type ToggleId,
} from './data';
import { calc, flip, focusHint, setLevel, ship, shipMistake } from './logic';

export function DesignCompanionGame({ api }: { api: GameApi }): React.JSX.Element {
  const [design, setDesign] = useState<Design>(START_DESIGN);
  const ref = useRef(design);
  const apiRef = useRef(api);
  apiRef.current = api;
  const shipped = useRef(false);
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= layout.sideBySide;
  const narrow = width <= layout.mobileBreakpoint;

  const commit = (next: Design): void => {
    ref.current = next;
    setDesign(next);
  };

  useEffect(() => {
    api.registerPowers({
      scan: () => {
        commit(XRAY_DESIGN);
        apiRef.current.say(XRAY_LINE, 'good');
        return true;
      },
      hint: () => {
        apiRef.current.say(focusHint(ref.current), 'good');
        return true;
      },
    });
    return () => {
      if (winTimer.current) clearTimeout(winTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = (): boolean => apiRef.current.over || shipped.current;

  const onSlide = (key: 'e' | 'd', v: number): void => {
    if (locked()) return;
    commit(setLevel(ref.current, key, v));
  };

  const onToggle = (id: ToggleId): void => {
    if (locked()) return;
    commit(flip(ref.current, id));
  };

  const onShip = (): void => {
    if (locked()) return;
    const r = ship(ref.current);
    if (!r.ok) {
      apiRef.current.miss(r.message, shipMistake(ref.current));
      return;
    }
    shipped.current = true;
    apiRef.current.say(SHIPPED_LINE, 'good');
    winTimer.current = setTimeout(() => apiRef.current.win(SUMMARY), WIN_DELAY_MS);
  };

  const c = calc(design);
  const disabled = api.over;

  return (
    <View style={styles.wrap} testID="m4g3-panel">
      {narrow ? null : (
        <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">
          {HEADING}
        </PixelText>
      )}
      <View style={[styles.columns, wide ? styles.columnsWide : null]}>
        <View style={[styles.controls, wide ? styles.column : null]}>
          {SLIDERS.map((s) => (
            <Slider
              key={s.id}
              id={s.id}
              label={s.label}
              value={Math.round(design[s.key])}
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              disabled={disabled}
              onChange={(v) => onSlide(s.key, v)}
            />
          ))}
          {TOGGLES.map((t) => (
            <ToggleTile key={t.id} id={t.id} label={t.label} icon={t.icon} on={design[t.id] === 1} disabled={disabled} onToggle={() => onToggle(t.id)} />
          ))}
        </View>
        <View style={[styles.metrics, wide ? styles.column : null]}>
          {METRICS.map((m) => (
            <MetricBar key={m.id} id={m.testId} label={m.label} value={c[m.id]} target={m.target} direction={m.dir} icon={m.icon} />
          ))}
          <PixelButton label={SHIP_LABEL} variant="primary" testID="m4g3-ship" disabled={disabled} onPress={onShip} fullWidth />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  columns: { gap: 3 },
  columnsWide: { flexDirection: 'row' },
  column: { flex: 1, minWidth: 0 },
  controls: { gap: 2 },
  metrics: { gap: 2 },
});
