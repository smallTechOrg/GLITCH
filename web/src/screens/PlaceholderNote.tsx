// SCAFFOLD PLACEHOLDER marker shared by the placeholder screens (slice A1 replaces screens/**).
import React from 'react';
import { StyleSheet } from 'react-native';
import { colors, fontSize } from '../theme/tokens';
import { PixelText } from '../ui/PixelText';

export function PlaceholderNote({ what }: { what: string }): React.JSX.Element {
  return (
    <PixelText testID="screen-placeholder" size={fontSize.tiny} color={colors.mu} style={styles.note}>
      {`${what} · placeholder — the full screen arrives with slice A1`}
    </PixelText>
  );
}

const styles = StyleSheet.create({ note: { marginVertical: 10 } });
