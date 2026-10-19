// One badge on Home (v3 `.bd`): coloured + "UNLOCKED" when earned, greyed with its how-to text when not.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { BadgeDef } from '../content/badges';
import { Icon } from '../art/Icon';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from '../ui/PixelText';
import { HOME } from './copy';

export function BadgeTile({ badge, unlocked }: { badge: BadgeDef; unlocked: boolean }): React.JSX.Element {
  return (
    <View
      testID={`badge-${badge.id}`}
      accessible
      accessibilityLabel={`${badge.name}, ${unlocked ? 'unlocked' : 'locked'}`}
      accessibilityHint={unlocked ? undefined : badge.description}
      style={[styles.bd, unlocked ? styles.on : null]}
    >
      {/* Greyed while locked (v3 opacity .45) on the icon only, so the text keeps ≥4.5:1 contrast. */}
      <View style={unlocked ? null : styles.dim}>
        <Icon name={badge.icon} scale={5} />
      </View>
      <PixelText size={fontSize.tiny} bold style={styles.center}>{badge.name}</PixelText>
      <PixelText size={fontSize.tiny} color={unlocked ? colors.ok : colors.mu} style={styles.center}>{unlocked ? HOME.unlocked : badge.description}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  bd: { flexGrow: 1, flexBasis: 130, alignItems: 'center', gap: 6, padding: 10, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln },
  on: { borderColor: colors.ac },
  dim: { opacity: 0.4 },
  center: { textAlign: 'center' },
});
