// Mistake recap — on the win screen (below the tags, above the buttons) and the fail screen
// (above the buttons) (spec/ui.md → Tutor NOVA → Recap; mistake-recap.md). Built on the device
// from this run's mistakes; never calls the network. The exported name and the props
// interface below are FROZEN (the Game Frame mounts it).
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SessionMistake } from '../../contracts/game';
import { border, colors, fontSize } from '../../theme/tokens';
import { PixelText } from '../../ui/PixelText';
import { Tag } from '../../ui/Tag';
import type { Explanation } from '../tutor/AskNovaWhy';
import { RECAP } from './copy';
import { buildRecap } from './logic';

export interface MistakeRecapProps {
  /** This run's recorded mistakes, oldest first (shielded ones included). */
  mistakes: readonly SessionMistake[];
  /** Explanations fetched this run, keyed by `mistakeKey` (itemId|answer). */
  explanations: Readonly<Record<string, Explanation>>;
}

export function MistakeRecap({ mistakes, explanations }: MistakeRecapProps): React.JSX.Element {
  const recap = useMemo(() => buildRecap(mistakes, explanations), [mistakes, explanations]);
  return (
    <View testID="recap" style={styles.box}>
      <PixelText size={fontSize.tiny} color={colors.ac} bold accessibilityRole="header">{RECAP.heading}</PixelText>
      {recap.rows.length === 0 ? (
        <PixelText testID="recap-clean" long size={fontSize.small} color={colors.ok}>{RECAP.clean}</PixelText>
      ) : null}
      {recap.rows.map((r, i) => (
        <View
          key={r.key}
          testID={`recap-row-${i}`}
          accessible
          accessibilityLabel={RECAP.rowLabel(r.itemText, r.answerLabel, r.correctLabel, r.why)}
          style={styles.row}
        >
          <View style={styles.top}>
            <PixelText testID={`recap-item-${i}`} long size={fontSize.small} style={styles.item}>{r.itemText}</PixelText>
            {r.count > 1 ? <Tag testID={`recap-count-${i}`} label={RECAP.count(r.count)} /> : null}
            {r.shielded ? <Tag testID={`recap-shielded-${i}`} label={RECAP.shielded} variant="soon" /> : null}
          </View>
          <PixelText testID={`recap-said-${i}`} size={fontSize.tiny} color={colors.no}>{RECAP.said(r.answerLabel)}</PixelText>
          <PixelText testID={`recap-was-${i}`} size={fontSize.tiny} color={colors.ok}>{RECAP.was(r.correctLabel)}</PixelText>
          <PixelText testID={`recap-why-${i}`} long size={fontSize.small} color={colors.mu}>{r.why}</PixelText>
        </View>
      ))}
      {recap.more > 0 ? (
        <PixelText testID="recap-more" size={fontSize.tiny} color={colors.mu}>{RECAP.more(recap.more)}</PixelText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', maxWidth: 560, width: '100%', gap: 10, borderWidth: border.thin, borderColor: colors.ln, paddingVertical: 10, paddingHorizontal: 14, marginVertical: 12 },
  row: { gap: 4, borderTopWidth: border.thin, borderTopColor: colors.ln, paddingTop: 8 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  item: { flex: 1, minWidth: 160 },
});
