// REVIEW · IDEAS TO PRACTISE — Home, directly under `home-energy` (spec/ui.md → Tutor NOVA;
// mistake-memory.md). Prop-less (FROZEN): reads `mistakes` from the store and derives the
// top 3 concepts. No records → renders nothing (the panel has no empty state).
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { gameHref } from '../../contracts/routes';
import { GAME_META } from '../../content/modules';
import { useGlitchStore } from '../../state/store';
import { border, colors, fontSize } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { goTo } from '../../screens/nav';
import { REVIEW } from './copy';
import { conceptSlug, moduleOfGame, topConcepts } from './logic';

export function ReviewPanel(): React.JSX.Element | null {
  const mistakes = useGlitchStore((s) => s.mistakes);
  const rows = useMemo(() => topConcepts(mistakes ?? []), [mistakes]);
  if (rows.length === 0) return null;
  return (
    <View testID="home-review" style={styles.box}>
      <PixelText size={fontSize.tiny} color={colors.ac} bold accessibilityRole="header">{REVIEW.heading}</PixelText>
      {rows.map((t) => {
        const slug = conceptSlug(t.concept);
        const title = GAME_META[t.gameId].title;
        return (
          <View key={t.concept} testID={`review-concept-${slug}`} style={styles.row}>
            <PixelText long size={fontSize.small} style={styles.label}>{REVIEW.row(t.concept, t.misses)}</PixelText>
            <PixelButton
              testID={`review-replay-${slug}`}
              variant="small"
              label={REVIEW.replay(title)}
              accessibilityHint={REVIEW.replayHint(t.concept)}
              onPress={() => goTo(gameHref(moduleOfGame(t.gameId), t.gameId))}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, backgroundColor: colors.ln, borderWidth: border.width, borderColor: colors.mu, paddingVertical: 12, paddingHorizontal: 16, marginVertical: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  label: { flex: 1, minWidth: 180 },
});
