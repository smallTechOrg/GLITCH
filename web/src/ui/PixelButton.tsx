// v3 `.ch` / `.ch.pri` / `.homeb` / `.link` buttons: chunky 3 px border + hard shadow.
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconId } from '../contracts/art';
import { Icon } from '../art/Icon';
import { border, colors, fontSize, layout, shadows } from '../theme/tokens';
import { PixelText } from './PixelText';
import { useFocusRing } from './focus';

export type ButtonVariant = 'primary' | 'secondary' | 'small' | 'link';

export interface PixelButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: IconId;
  iconScale?: number;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  color?: string; // border colour override (power button uses the module colour)
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode; // extra content after the label (e.g. "x2")
  /** Icon-only rendering (narrow screens): the label stays as the accessibility label. */
  iconOnly?: boolean;
}

export function PixelButton({
  label, onPress, variant = 'secondary', disabled = false, icon, iconScale = 2, testID,
  accessibilityLabel, accessibilityHint, color, fullWidth, style, children, iconOnly = false,
}: PixelButtonProps): React.JSX.Element {
  const f = useFocusRing();
  const v = VARIANTS[variant];
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onFocus={f.onFocus}
      onBlur={f.onBlur}
      accessibilityRole={variant === 'link' ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        v.box,
        color ? { borderColor: color } : null,
        fullWidth ? styles.full : null,
        pressed && variant !== 'link' ? styles.pressed : null,
        disabled ? styles.disabled : null,
        f.ring,
        style,
      ]}
    >
      <View style={styles.row}>
        {icon ? <Icon name={icon} scale={iconScale} /> : null}
        {iconOnly && icon ? null : (
          <PixelText size={v.size} color={v.text} style={variant === 'link' ? styles.underline : null}>
            {label}
          </PixelText>
        )}
        {children}
      </View>
    </Pressable>
  );
}

const VARIANTS: Record<ButtonVariant, { box: ViewStyle; text: string; size: number }> = {
  primary: { box: { backgroundColor: colors.ac, borderColor: colors.white, boxShadow: shadows.button, paddingVertical: 12, paddingHorizontal: 14 }, text: colors.ink, size: fontSize.ui },
  secondary: { box: { backgroundColor: colors.cd, borderColor: colors.ln, boxShadow: shadows.button, paddingVertical: 12, paddingHorizontal: 14 }, text: colors.tx, size: fontSize.ui },
  small: { box: { backgroundColor: colors.cd, borderColor: colors.ln, borderWidth: border.thin, paddingVertical: 6, paddingHorizontal: 8 }, text: colors.bl, size: fontSize.tiny },
  link: { box: { backgroundColor: 'transparent', borderWidth: 0, paddingVertical: 6, paddingHorizontal: 4 }, text: colors.bl, size: fontSize.tiny },
};

const styles = StyleSheet.create({
  base: { borderWidth: border.width, minHeight: layout.minTouch, minWidth: layout.minTouch, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  full: { alignSelf: 'stretch', marginTop: 12 },
  pressed: { boxShadow: 'none', transform: [{ translateX: 1 }, { translateY: 1 }] },
  disabled: { opacity: 0.5 },
  underline: { textDecorationLine: 'underline' },
});
