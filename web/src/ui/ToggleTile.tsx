// v3 `.tgl`: feature/safeguard toggle with ON/OFF text tag (colour is never the only signal).
import React from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconId } from '../contracts/art';
import { Icon } from '../art/Icon';
import { ANIM } from '../a11y/stepped';
import { useStepAnimation } from '../a11y/useStepAnimation';
import { border, colors, fontSize, layout } from '../theme/tokens';
import { PixelText } from './PixelText';
import { useFocusRing } from './focus';

export interface ToggleTileProps {
  id: string; // testID toggle-<id>
  label: string;
  on: boolean;
  onToggle(): void;
  icon?: IconId;
  flash?: boolean; // FOCUS highlight
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ToggleTile({ id, label, on, onToggle, icon, flash = false, disabled = false, style }: ToggleTileProps): React.JSX.Element {
  const f = useFocusRing();
  const fl = useStepAnimation({ ...ANIM.flash, loop: true, play: flash, restValue: 0 });
  return (
    <Pressable
      testID={`toggle-${id}`}
      onPress={disabled ? undefined : onToggle}
      disabled={disabled}
      onFocus={f.onFocus}
      onBlur={f.onBlur}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      style={[styles.tile, on ? styles.on : null, f.ring, style]}
    >
      {icon ? <Icon name={icon} scale={3} /> : null}
      <PixelText size={fontSize.small} style={styles.label}>{label}</PixelText>
      <View style={[styles.tag, { backgroundColor: on ? colors.okDark : colors.no }]}>
        <PixelText size={fontSize.tiny} color={on ? colors.white : colors.ink}>{on ? 'ON' : 'OFF'}</PixelText>
      </View>
      {flash ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: fl.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }) }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, minHeight: layout.minTouch, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln },
  on: { borderColor: colors.ok },
  label: { flex: 1 },
  tag: { paddingVertical: 2, paddingHorizontal: 6 },
  flash: { borderWidth: 4, borderColor: colors.ac },
});
