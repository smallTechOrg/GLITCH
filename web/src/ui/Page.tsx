// One-screen page body. Screens are laid out to fit the viewport; the ScrollView only ever
// engages as a last resort on a screen too small to fit (see e2e/fit.spec.ts).
import React from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { layout } from '../theme/tokens';

export interface PageProps {
  children?: React.ReactNode;
  testID?: string;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Page({ children, testID, scroll = true, style }: PageProps): React.JSX.Element {
  if (!scroll) {
    return (
      <View testID={testID} style={styles.fill}>
        <View style={[styles.inner, styles.fill, style]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView testID={testID} style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.inner, style]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1 },
  inner: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingTop: 10, paddingHorizontal: layout.pagePadding, paddingBottom: 10 },
});
