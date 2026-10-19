// Accessible stepped slider (architecture → Contracts → ui/Slider.tsx): role adjustable,
// ←/→ ±1, PageUp/PageDown ±10, Home/End, visible − / + buttons, drag/tap on the track.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { border, colors, fontSize, layout } from '../theme/tokens';
import { PixelButton } from './PixelButton';
import { PixelText } from './PixelText';
import { useFocusRing } from './focus';

export interface SliderProps {
  id: string; // testIDs: slider-<id>, slider-<id>-dec, slider-<id>-inc, slider-<id>-value
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange(value: number): void;
  style?: StyleProp<ViewStyle>;
}

export const clampStep = (v: number, min: number, max: number, step = 1): number => {
  const s = step > 0 ? step : 1;
  const snapped = Math.round((v - min) / s) * s + min;
  return Math.max(min, Math.min(max, Number(snapped.toFixed(6))));
};

/** Keyboard → next value, or null when the key is not a slider key. */
export function sliderKeyValue(key: string, value: number, min: number, max: number, step = 1): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clampStep(value + step, min, max, step);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampStep(value - step, min, max, step);
    case 'PageUp':
      return clampStep(value + 10 * step, min, max, step);
    case 'PageDown':
      return clampStep(value - 10 * step, min, max, step);
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return null;
  }
}

/** Track x position → value. */
export const valueAtX = (x: number, width: number, min: number, max: number, step = 1): number =>
  width <= 0 ? min : clampStep(min + (Math.max(0, Math.min(width, x)) / width) * (max - min), min, max, step);

export function Slider({ id, label, value, min, max, step = 1, disabled = false, onChange, style }: SliderProps): React.JSX.Element {
  const f = useFocusRing();
  const [w, setW] = useState(0);
  const live = useRef({ value, w, min, max, step, onChange, disabled });
  live.current = { value, w, min, max, step, onChange, disabled };

  const set = useCallback((v: number) => {
    const c = live.current;
    if (c.disabled) return;
    const next = clampStep(v, c.min, c.max, c.step);
    if (next !== c.value) c.onChange(next);
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.disabled,
        onMoveShouldSetPanResponder: () => !live.current.disabled,
        onPanResponderGrant: (e) => set(valueAtX(e.nativeEvent.locationX, live.current.w, live.current.min, live.current.max, live.current.step)),
        onPanResponderMove: (e) => set(valueAtX(e.nativeEvent.locationX, live.current.w, live.current.min, live.current.max, live.current.step)),
        onPanResponderTerminationRequest: () => false,
      }),
    [set],
  );

  const onKeyDown = (e: { nativeEvent: { key: string }; preventDefault?: () => void }): void => {
    const next = sliderKeyValue(e.nativeEvent.key, value, min, max, step);
    if (next === null) return;
    e.preventDefault?.();
    set(next);
  };

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const webKeys = Platform.OS === 'web' ? ({ onKeyDown } as object) : {};

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.labelRow}>
        <PixelText size={fontSize.small}>{label}</PixelText>
        <PixelText size={fontSize.small} color={colors.ac} testID={`slider-${id}-value`}>{String(value)}</PixelText>
      </View>
      <View style={styles.row}>
        <PixelButton label="−" variant="small" testID={`slider-${id}-dec`} accessibilityLabel={`Decrease ${label}`} disabled={disabled || value <= min} onPress={() => set(value - step)} />
        <View
          testID={`slider-${id}`}
          focusable={!disabled}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          accessibilityValue={{ min, max, now: value }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => set(e.nativeEvent.actionName === 'increment' ? value + step : value - step)}
          onFocus={f.onFocus}
          onBlur={f.onBlur}
          onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
          style={[styles.track, disabled ? styles.disabled : null, f.ring]}
          {...webKeys}
          {...pan.panHandlers}
        >
          <View pointerEvents="none" style={styles.trough}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <View pointerEvents="none" style={[styles.thumb, { left: `${pct}%` }]} />
        </View>
        <PixelButton label="+" variant="small" testID={`slider-${id}-inc`} accessibilityLabel={`Increase ${label}`} disabled={disabled || value >= max} onPress={() => set(value + step)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8, gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: layout.minTouch, justifyContent: 'center', cursor: 'pointer' },
  trough: { height: 10, backgroundColor: colors.deep, borderWidth: border.thin, borderColor: colors.ln },
  fill: { height: '100%', backgroundColor: colors.ac },
  thumb: { position: 'absolute', width: 14, height: 24, marginLeft: -7, backgroundColor: colors.ac, borderWidth: border.thin, borderColor: colors.white },
  disabled: { opacity: 0.5 },
});
