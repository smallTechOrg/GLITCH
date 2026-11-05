// Mistake recap, on the win and fail screens (mistake-recap.md). Built on the device from this
// run's mistakes; never calls the network. Shows one mistake at a time with ◀ ▶ so it always fits
// the screen. The exported name and the props interface below are FROZEN (the Game Frame mounts it).
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SessionMistake } from '../../contracts/game';
import { border, colors, fontSize } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
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
  const [page, setPage] = useState(0);
  const i = Math.min(page, Math.max(0, recap.rows.length - 1));
  const r = recap.rows[i];
  return (
    <View testID="recap" style={styles.box}>
      <View style={styles.head}>
        <PixelText size={fontSize.tiny} color={colors.ac} bold accessibilityRole="header" style={styles.flex}>{RECAP.heading}</PixelText>
        {recap.rows.length > 1 ? (
          <>
            <PixelButton testID="recap-prev" variant="small" label="◀" accessibilityLabel="Previous mistake" disabled={i === 0} onPress={() => setPage(i - 1)} style={styles.nav} />
            <PixelText testID="recap-page" size={fontSize.tiny} color={colors.mu}>{`${i + 1}/${recap.rows.length}`}</PixelText>
            <PixelButton testID="recap-next" variant="small" label="▶" accessibilityLabel="Next mistake" disabled={i === recap.rows.length - 1} onPress={() => setPage(i + 1)} style={styles.nav} />
          </>
        ) : null}
      </View>
      {r ? (
        <View
          key={r.key}
          testID={`recap-row-${i}`}
          accessible
          accessibilityLabel={RECAP.rowLabel(r.itemText, r.answerLabel, r.correctLabel, r.why)}
          style={styles.row}
        >
          <View style={styles.top}>
            <PixelText testID={`recap-item-${i}`} long size={fontSize.small} style={styles.flex}>{r.itemText}</PixelText>
            {r.count > 1 ? <Tag testID={`recap-count-${i}`} label={RECAP.count(r.count)} /> : null}
            {r.shielded ? <Tag testID={`recap-shielded-${i}`} label={RECAP.shielded} variant="soon" /> : null}
          </View>
          <PixelText testID={`recap-said-${i}`} size={fontSize.tiny} color={colors.no}>{RECAP.said(r.answerLabel)}</PixelText>
          <PixelText testID={`recap-was-${i}`} size={fontSize.tiny} color={colors.ok}>{RECAP.was(r.correctLabel)}</PixelText>
          <PixelText testID={`recap-why-${i}`} long size={fontSize.small} color={colors.mu}>{r.why}</PixelText>
        </View>
      ) : (
        <PixelText testID="recap-clean" long size={fontSize.small} color={colors.ok}>{RECAP.clean}</PixelText>
      )}
      {recap.more > 0 ? (
        <PixelText testID="recap-more" size={fontSize.tiny} color={colors.mu}>{RECAP.more(recap.more)}</PixelText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', maxWidth: 640, width: '100%', gap: 4, borderWidth: border.thin, borderColor: colors.ln, paddingVertical: 6, paddingHorizontal: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nav: { minHeight: 32, minWidth: 40, paddingVertical: 0 },
  row: { gap: 2 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 120 },
});
