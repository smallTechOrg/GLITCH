// One step button on a module card (v3 `.stp`): tag HERO/STORY/GAME, label, status
// (done game → its stars, min 1; done → DONE; startable → START; else a lock).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StepDef } from '../content/modules';
import { Icon } from '../art/Icon';
import { border, colors, fontSize, layout } from '../theme/tokens';
import { PixelText } from '../ui/PixelText';
import { useFocusRing } from '../ui/focus';
import { HOME } from './copy';

export interface StepRowProps {
  step: StepDef;
  done: boolean;
  open: boolean;
  stars: number; // best stars for a game step (0 if none)
  onPress(): void;
}

export function StepRow({ step, done, open, stars, onPress }: StepRowProps): React.JSX.Element {
  const f = useFocusRing();
  const isGame = step.kind === 'GAME';
  const shownStars = Math.max(1, stars);
  const statusLabel = isGame && done ? `${shownStars} ${shownStars === 1 ? 'star' : 'stars'}` : done ? HOME.done : open ? HOME.start : HOME.locked;
  return (
    <Pressable
      testID={`step-${step.id}`}
      onPress={open ? onPress : undefined}
      disabled={!open}
      onFocus={f.onFocus}
      onBlur={f.onBlur}
      accessibilityRole="button"
      accessibilityLabel={`${step.kind} ${step.label}, ${statusLabel}`}
      accessibilityState={{ disabled: !open }}
      aria-disabled={!open}
      style={[styles.row, done ? styles.done : null, open && !done ? styles.go : null, !open ? styles.disabled : null, f.ring]}
    >
      <View style={styles.kind}>
        <PixelText size={fontSize.tiny}>{step.kind}</PixelText>
      </View>
      <PixelText size={fontSize.small} style={styles.label}>{step.label}</PixelText>
      {isGame && done ? (
        <View testID={`step-${step.id}-status`} accessible accessibilityLabel={statusLabel} style={styles.stars}>
          {[0, 1, 2].map((i) => (
            <Icon key={i} name={i < shownStars ? 'star' : 'star0'} scale={2} />
          ))}
        </View>
      ) : done || open ? (
        <PixelText testID={`step-${step.id}-status`} size={fontSize.tiny} color={done ? colors.ok : colors.ac}>{statusLabel}</PixelText>
      ) : (
        <View testID={`step-${step.id}-status`} accessible accessibilityLabel={HOME.locked}>
          <Icon name="lock" scale={2} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minHeight: layout.minTouch, borderWidth: border.thin, borderColor: colors.ln, backgroundColor: colors.stepBg },
  go: { borderColor: colors.ac },
  done: {},
  disabled: { opacity: 0.55 },
  kind: { paddingVertical: 3, paddingHorizontal: 5, backgroundColor: colors.ln, minWidth: 56, alignItems: 'center' },
  label: { flex: 1 },
  stars: { flexDirection: 'row', gap: 2 },
});
