// "YOUR PROMPT LOG" — collapsed by default; the last 5 on-device history entries with goal,
// n/5, source tag (NOVA / OFFLINE / DEMO) and expandable prompt text. Device only.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useGlitchStore } from '../../state/store';
import { border, colors, fontSize, layout } from '../../theme/tokens';
import { useFocusRing } from '../../ui/focus';
import { PixelText } from '../../ui/PixelText';
import { Tag } from '../../ui/Tag';
import type { PromptHistoryEntry } from '../../contracts/state';
import { COPY, LOG_SHOWN, SOURCE_TAG } from './data';

function Entry({ e, index }: { e: PromptHistoryEntry; index: number }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const f = useFocusRing();
  return (
    <Pressable
      testID={`fw-history-entry-${index}`}
      onPress={() => setOpen((o) => !o)}
      onFocus={f.onFocus}
      onBlur={f.onBlur}
      accessibilityRole="button"
      accessibilityLabel={`${e.goal} ${e.leversHit} of 5 levers, ${SOURCE_TAG[e.source]}`}
      accessibilityHint={open ? 'Hide the prompt' : 'Show the prompt'}
      accessibilityState={{ expanded: open }}
      style={[styles.entry, f.ring]}
    >
      <View style={styles.entryHead}>
        <PixelText size={fontSize.tiny} color={colors.tx} style={styles.goal}>{e.goal}</PixelText>
        <PixelText size={fontSize.tiny} color={e.passed ? colors.ok : colors.no}>{`${e.leversHit}/5`}</PixelText>
        <Tag label={SOURCE_TAG[e.source]} variant={e.source === 'offline' ? 'neutral' : e.source === 'demo' ? 'soon' : 'good'} />
      </View>
      {open ? (
        <PixelText long testID={`fw-history-text-${index}`} color={colors.mu}>{e.prompt}</PixelText>
      ) : null}
    </Pressable>
  );
}

export function PromptLog(): React.JSX.Element {
  const history = useGlitchStore((s) => s.promptHistory);
  const [open, setOpen] = useState(false);
  const f = useFocusRing();
  const shown = history.slice(0, LOG_SHOWN);
  return (
    <View testID="fw-history" style={styles.wrap}>
      <Pressable
        testID="fw-history-toggle"
        onPress={() => setOpen((o) => !o)}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        accessibilityRole="button"
        accessibilityLabel={`${COPY.logTitle}, ${history.length} ${history.length === 1 ? 'entry' : 'entries'}`}
        accessibilityState={{ expanded: open }}
        style={[styles.toggle, f.ring]}
      >
        <PixelText size={fontSize.tiny} color={colors.ac}>{`${open ? '▼' : '▶'} ${COPY.logTitle} (${history.length})`}</PixelText>
      </Pressable>
      {open ? (
        shown.length === 0 ? (
          <PixelText testID="fw-history-empty" size={fontSize.tiny} color={colors.mu}>{COPY.logEmpty}</PixelText>
        ) : (
          <View style={styles.list}>
            {shown.map((e, i) => (
              <Entry key={e.id} e={e} index={i} />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 8 },
  toggle: { minHeight: layout.minTouch, justifyContent: 'center' },
  list: { gap: 6 },
  entry: { borderWidth: border.thin, borderColor: colors.ln, backgroundColor: colors.deep, padding: 8, gap: 6, minHeight: layout.minTouch },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  goal: { flexShrink: 1, flexGrow: 1 },
});
