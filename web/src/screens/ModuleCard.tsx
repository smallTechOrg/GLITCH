// One module on the Home course path (v3 `.mod`, line 356): number/check/lock, scene banner
// (greyscale when locked), chosen hero's head, status, title, subtitle, tags, progress bar, steps.
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { ModuleDef } from '../content/modules';
import { stepsOf } from '../content/modules';
import type { PersistedState } from '../contracts/state';
import { stepHref } from '../contracts/routes';
import { Icon } from '../art/Icon';
import { Scene } from '../art/Scene';
import { Sprite } from '../art/Sprite';
import { isModuleDone, isModuleOpen, isStepOpenInModule, stepsDoneIn } from '../engine/progression';
import { border, colors, fontSize } from '../theme/tokens';
import { Bar } from '../ui/Bar';
import { PixelText } from '../ui/PixelText';
import { HOME } from './copy';
import { goTo } from './nav';
import { StepRow } from './StepRow';

export interface ModuleCardProps {
  mod: ModuleDef;
  state: Pick<PersistedState, 'steps' | 'stars' | 'heroByModule'>;
}

export function ModuleCard({ mod, state }: ModuleCardProps): React.JSX.Element {
  const open = isModuleOpen(state, mod.id);
  const done = isModuleDone(state, mod.id);
  const steps = stepsOf(mod.id);
  const dc = stepsDoneIn(state, mod.id);
  const hero = state.heroByModule[mod.id];
  const status = open ? `${dc}/${steps.length} STEPS` : HOME.locked;
  // Phones: the number badge sits above the card so step rows keep enough width (no sideways scroll at 320 px).
  const stacked = useWindowDimensions().width < STACK_BELOW;
  return (
    <View testID={`module-card-${mod.id}`} style={[styles.mod, stacked ? styles.modStacked : null, !open ? styles.locked : null]}>
      <View
        style={[styles.num, { borderColor: mod.color }, done ? { backgroundColor: mod.color } : null]}
        accessible
        accessibilityLabel={done ? `Module ${mod.id} done` : open ? `Module ${mod.id}` : `Module ${mod.id} locked`}
      >
        {done ? <Icon name="check" scale={3} /> : open ? <PixelText size={fontSize.h3} color={mod.color}>{String(mod.id)}</PixelText> : <Icon name="lock" scale={3} />}
      </View>
      <View style={[styles.body, open ? { borderColor: mod.color } : null]}>
        <View style={styles.banner}>
          <Scene id={mod.scene} filter={open ? 'none' : 'locked'} />
          <View style={styles.overlay}>
            <Icon name={mod.icon} scale={4} />
            {hero ? <Sprite id={hero} crop="head" scale={3} /> : null}
          </View>
        </View>
        <View style={[styles.inner, stacked ? styles.innerStacked : null]}>
          <View style={styles.statusRow}>
            <PixelText size={fontSize.tiny} color={colors.mu}>{`MODULE ${mod.id} · `}</PixelText>
            <PixelText testID={`module-status-${mod.id}`} size={fontSize.tiny} color={colors.mu}>{status}</PixelText>
          </View>
          <PixelText size={fontSize.h3} bold accessibilityRole="header" style={styles.title}>{mod.title}</PixelText>
          <PixelText long size={fontSize.small} color={colors.mu}>{mod.subtitle}</PixelText>
          <View style={styles.tags}>
            {mod.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <PixelText size={fontSize.tiny} color={colors.bl}>{t}</PixelText>
              </View>
            ))}
          </View>
          {open ? (
            <>
              <Bar value={dc / steps.length} accessibilityLabel={`Module ${mod.id} progress`} />
              <View style={styles.steps}>
                {steps.map((st) => (
                  <StepRow
                    key={st.id}
                    step={st}
                    done={state.steps[st.id] === true}
                    open={isStepOpenInModule(state, st.id)}
                    stars={st.kind === 'GAME' ? (state.stars[st.id as keyof typeof state.stars] ?? 0) : 0}
                    onPress={() => goTo(stepHref(st.id))}
                  />
                ))}
              </View>
            </>
          ) : (
            <PixelText size={fontSize.tiny} color={colors.mu}>{HOME.lockedMsg(mod.id - 1)}</PixelText>
          )}
        </View>
      </View>
    </View>
  );
}

const STACK_BELOW = 480;

const styles = StyleSheet.create({
  mod: { flexDirection: 'row', gap: 14 },
  modStacked: { flexDirection: 'column', gap: 8 },
  locked: { opacity: 0.8 },
  num: { width: 46, height: 46, backgroundColor: colors.cd, borderWidth: border.width, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln, overflow: 'hidden' },
  banner: { height: 120, overflow: 'hidden', borderBottomWidth: border.width, borderBottomColor: colors.ln },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12 },
  inner: { padding: 14 },
  innerStacked: { padding: 10 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap' },
  title: { marginVertical: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 10 },
  tag: { paddingVertical: 4, paddingHorizontal: 6, borderWidth: border.thin, borderColor: colors.ln, maxWidth: '100%' },
  steps: { gap: 6, marginTop: 10 },
});
