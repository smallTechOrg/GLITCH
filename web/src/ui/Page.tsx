// Scrollable page body: max content width 960 px (v3 `#wp`), mobile-first padding.
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
  const inner = <View style={[styles.inner, style]}>{children}</View>;
  if (!scroll) {
    return (
      <View testID={testID} style={styles.fill}>
        {inner}
      </View>
    );
  }
  return (
    <ScrollView testID={testID} style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {inner}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1 },
  inner: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', paddingTop: 16, paddingHorizontal: layout.pagePadding, paddingBottom: 60 },
});
