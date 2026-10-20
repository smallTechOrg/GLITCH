// Case-file chrome in the game frame: the "NEW CASE FILE" tag on a variation, the in-world
// "NOVA'S OFFLINE" note on a v3 fallback, and NOVA "thinking" while the next file is fetched.
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { announce } from '../../a11y/announce';
import { NOVA_THINK_FPS } from '../../a11y/stepped';
import { useFrameCycle } from '../../a11y/useStepAnimation';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { Sprite } from '../../art/Sprite';
import { border, colors, fontSize } from '../../theme/tokens';
import { PixelText } from '../../ui/PixelText';
import { Tag } from '../../ui/Tag';
import type { CaseFile } from './caseFile';
import { CASE_FILE } from './copy';

/** Tag/note for the case file in play (nothing for a plain first play). */
export function CaseFileBadge({ file }: { file: CaseFile }): React.JSX.Element | null {
  if (file.kind === 'variation') {
    return <Tag testID="case-file-tag" label={CASE_FILE.newTag} variant="soon" />;
  }
  if (file.note) {
    return (
      <View testID="case-file-offline" accessible accessibilityRole="text" accessibilityLabel={CASE_FILE.offlineNote} style={styles.note}>
        <PixelText long size={fontSize.tiny} color={colors.ac}>{CASE_FILE.offlineNote}</PixelText>
      </View>
    );
  }
  return null;
}

/** NOVA thinking while the next case file is fetched (bounded by SCENARIO_TIMEOUT_MS). */
export function CaseFileLoading(): React.JSX.Element {
  const still = useReducedMotion();
  const dots = useFrameCycle(3, NOVA_THINK_FPS, !still);
  useEffect(() => {
    announce(CASE_FILE.fetching);
  }, []);
  return (
    <View
      testID="case-file-loading"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={CASE_FILE.fetching}
      aria-busy
      style={styles.loading}
    >
      <Tag label={CASE_FILE.newTag} variant="soon" />
      <View style={styles.row}>
        <Sprite id="n" frame="think" scale={3} />
        <View style={styles.text}>
          <PixelText size={fontSize.small} color={colors.bl}>{CASE_FILE.fetching}</PixelText>
          {still ? null : (
            <View style={styles.dots} accessible={false}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.dot, i <= dots ? styles.dotOn : null]} />
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { alignSelf: 'flex-start', borderWidth: border.thin, borderColor: colors.ac, borderStyle: 'dashed', paddingVertical: 4, paddingHorizontal: 8 },
  loading: { gap: 12, padding: 16, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  text: { gap: 6, flexShrink: 1 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, backgroundColor: colors.ln },
  dotOn: { backgroundColor: colors.bl },
});
