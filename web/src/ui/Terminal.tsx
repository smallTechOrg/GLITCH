// v3 `.term` / `.term.out`: dark console box with a small yellow heading (YOUR PROMPT, NOVA REPLIES).
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';

export interface TerminalProps {
  label?: string;
  text?: string;
  variant?: 'default' | 'out';
  children?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Terminal({ label, text, variant = 'default', children, testID, style }: TerminalProps): React.JSX.Element {
  return (
    <View testID={testID} style={[styles.term, variant === 'out' ? styles.out : null, style]}>
      {label ? <PixelText size={fontSize.tiny} color={colors.ac} style={styles.label}>{label}</PixelText> : null}
      {text !== undefined ? <PixelText long size={fontSize.small}>{text}</PixelText> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  term: { backgroundColor: colors.deep, borderWidth: border.width, borderColor: colors.ln, paddingVertical: 6, paddingHorizontal: 8 },
  out: { borderColor: colors.ln, borderLeftColor: colors.ok },
  label: { marginBottom: 2 },
});
