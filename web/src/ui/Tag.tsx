// v3 `.tag` / `.tg.bad|.good` text tags (TRUE/FIB, PROXY/OK, +30 XP, FLAWLESS, SOON…).
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';

export type TagVariant = 'neutral' | 'good' | 'bad' | 'goodSolid' | 'badSolid' | 'soon';

export interface TagProps {
  label: string;
  variant?: TagVariant;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const LOOK: Record<TagVariant, { bg: string; border: string; text: string }> = {
  neutral: { bg: 'transparent', border: colors.ln, text: colors.tx },
  good: { bg: 'transparent', border: colors.ok, text: colors.ok },
  bad: { bg: 'transparent', border: colors.no, text: colors.no },
  goodSolid: { bg: colors.okDark, border: colors.okDark, text: colors.white },
  badSolid: { bg: colors.no, border: colors.no, text: colors.ink },
  soon: { bg: colors.ac, border: colors.ac, text: colors.ink },
};

export function Tag({ label, variant = 'neutral', testID, style }: TagProps): React.JSX.Element {
  const l = LOOK[variant];
  return (
    <View testID={testID} style={[styles.tag, { backgroundColor: l.bg, borderColor: l.border }, style]}>
      <PixelText size={fontSize.tiny} color={l.text}>{label}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { paddingVertical: 4, paddingHorizontal: 8, borderWidth: border.thin, alignSelf: 'flex-start' },
});
