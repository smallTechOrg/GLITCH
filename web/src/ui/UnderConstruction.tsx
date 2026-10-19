// Scaffold placeholder body for game stubs: "UNDER CONSTRUCTION" and nothing else.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '../art/Icon';
import { colors, fontSize } from '../theme/tokens';
import { PixelText } from './PixelText';

export const UNDER_CONSTRUCTION = 'UNDER CONSTRUCTION';

export function UnderConstruction({ testID = 'under-construction' }: { testID?: string }): React.JSX.Element {
  return (
    <View testID={testID} style={styles.wrap}>
      <Icon name="warning" scale={4} />
      <PixelText size={fontSize.h3} color={colors.ac}>{UNDER_CONSTRUCTION}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', gap: 12, paddingVertical: 40 } });

/** Game-stub component: matches GameDefinition['Component'] and ignores the API. */
export function UnderConstructionGame(props: { api: unknown }): React.JSX.Element {
  void props;
  return <UnderConstruction />;
}
