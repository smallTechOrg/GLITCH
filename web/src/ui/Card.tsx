// v3 `.card`: indigo panel, 3 px border, double hard shadow.
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { border, colors, shadows } from '../theme/tokens';

export interface CardProps {
  children?: React.ReactNode;
  accent?: string; // border colour
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({ children, accent, style, testID }: CardProps): React.JSX.Element {
  return (
    <View testID={testID} style={[styles.card, accent ? { borderColor: accent } : null, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln, boxShadow: shadows.card, padding: 20 },
});
