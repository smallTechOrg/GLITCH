// SCAFFOLD STUB — slice E replaces src/features/freewrite/** with the real FORGE 3 · FREE WRITE
// round (spec/capabilities/freewrite-forge.md). Contract (frozen):
//   export interface FreeWriteRoundProps { api: GameApi; onPassed: () => void }
//   export function FreeWriteRound(props: FreeWriteRoundProps): JSX.Element;
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { colors, fontSize } from '../../theme/tokens';
import { PixelText } from '../../ui/PixelText';
import { UnderConstruction } from '../../ui/UnderConstruction';

export interface FreeWriteRoundProps {
  api: GameApi;
  onPassed: () => void;
}

export function FreeWriteRound(props: FreeWriteRoundProps): React.JSX.Element {
  void props;
  return (
    <View testID="fw-stub" style={styles.wrap}>
      <PixelText size={fontSize.h3} color={colors.ac}>FORGE 3 · FREE WRITE</PixelText>
      <UnderConstruction />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 8 } });
