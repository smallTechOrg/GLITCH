// v3 `.st` stat tile on Home (LVL n, total XP, streak, modules complete).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { IconId } from '../contracts/art';
import { Icon } from '../art/Icon';
import { border, colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';

export interface StatTileProps {
  value: string;
  label: string;
  icon?: IconId;
  testID?: string;
}

export function StatTile({ value, label, icon, testID }: StatTileProps): React.JSX.Element {
  return (
    <View testID={testID} accessible accessibilityLabel={`${value} ${label}`} style={styles.tile}>
      <View style={styles.row}>
        {icon ? <Icon name={icon} scale={3} /> : null}
        <PixelText size={fontSize.h3} color={colors.ac} bold>{value}</PixelText>
      </View>
      <PixelText size={fontSize.tiny} color={colors.mu} style={styles.label}>{label}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flexGrow: 1, flexBasis: 150, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { marginTop: 6 },
});
