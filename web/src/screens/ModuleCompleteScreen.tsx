// Module complete (v3 `modDoneScreen`, lines 374–378): once-bonus mod<n> +50 XP, confetti
// (28 pieces, 5 colours, static under reduced motion), bobbing trophy, "MODULE n COMPLETE",
// "+50 XP" when awarded now, "You covered:" + tags, WHAT'S NEXT / YOU FINISHED GLITCH.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { MODULE_IDS, type ModuleId } from '../contracts/ids';
import { heroHref } from '../contracts/routes';
import { Icon } from '../art/Icon';
import { Scene } from '../art/Scene';
import { getModule } from '../content/modules';
import { isModuleDone } from '../engine/progression';
import { ANIM, BOB_PX } from '../a11y/stepped';
import { bobTransform, useStepAnimation } from '../a11y/useStepAnimation';
import { announce } from '../a11y/announce';
import { rnd } from '../pixel/primitives';
import { completeModule } from '../state/actions';
import { useGlitchStore } from '../state/store';
import { border, colors, confettiColors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { Tag } from '../ui/Tag';
import { COMPLETE } from './copy';
import { LockedScreen } from './LockedScreen';
import { goHome, goTo } from './nav';

export const CONFETTI_COUNT = 28;
const CONFETTI_FALL_PX = 640;

export function ModuleCompleteScreen({ mod }: { mod: ModuleId }): React.JSX.Element {
  const m = getModule(mod);
  const done = useGlitchStore((s) => isModuleDone(s, mod));
  const [gained, setGained] = useState(0);
  const ran = useRef(false);
  useEffect(() => {
    if (!done || ran.current) return;
    ran.current = true;
    setGained(completeModule(mod, new Date()));
    announce(COMPLETE.tag(mod));
  }, [done, mod]);
  if (!done) return <LockedScreen />;

  const last = mod === MODULE_IDS[MODULE_IDS.length - 1];
  const next = last ? null : getModule((mod + 1) as ModuleId);
  return (
    <Page testID="complete-screen">
      <View style={styles.confetti} pointerEvents="none">
        {Array.from({ length: CONFETTI_COUNT }, (_, c) => (
          <ConfettiPiece key={c} index={c} />
        ))}
      </View>
      <View style={[styles.banner, { borderColor: m.color }]}>
        <Scene id={m.scene} ambient />
        <View style={styles.trophyWrap}>
          <Trophy />
        </View>
      </View>
      <View style={[styles.body, { borderColor: m.color }]}>
        <View style={styles.tags}>
          <Tag label={COMPLETE.tag(mod)} variant="good" />
          {gained > 0 ? <Tag testID="complete-xp-tag" label={`+${gained} XP`} variant="good" /> : null}
        </View>
        <PixelText size={fontSize.h2} color={colors.ac} bold accessibilityRole="header">{last ? COMPLETE.courseTitle : m.title}</PixelText>
        <PixelText long size={fontSize.small} color={colors.mu}>{COMPLETE.covered}</PixelText>
        <View style={styles.tags}>
          {m.tags.map((t) => (
            <Tag key={t} label={t} />
          ))}
        </View>
        <View style={styles.reveal}>
          <PixelText size={fontSize.tiny} color={colors.ac}>{last ? COMPLETE.finished : COMPLETE.next}</PixelText>
          <PixelText long size={fontSize.small}>{next ? COMPLETE.nextText(next.id, next.title) : COMPLETE.finishedText}</PixelText>
        </View>
        <View style={styles.buttons}>
          {next ? <PixelButton testID="complete-next" variant="primary" label={COMPLETE.startNext(next.id)} onPress={() => goTo(heroHref(next.id))} /> : null}
          <PixelButton testID="complete-home" label={COMPLETE.home} onPress={goHome} />
        </View>
      </View>
    </Page>
  );
}

function Trophy(): React.JSX.Element {
  const v = useStepAnimation({ ...ANIM.bob, loop: true });
  return (
    <Animated.View style={bobTransform(v, BOB_PX)}>
      <Icon name="trophy" scale={10} />
    </Animated.View>
  );
}

/** One confetti piece: v3 left = rnd(c)·100 %, delay = rnd(c+9)·1.6 s, falls 2.4 s steps(14). */
function ConfettiPiece({ index }: { index: number }): React.JSX.Element {
  const v = useStepAnimation({ ...ANIM.confetti, delayMs: Math.round(rnd(index + 9) * 1600), restValue: 0.15 + rnd(index + 3) * 0.6 });
  const left = `${Math.floor(rnd(index) * 100)}%` as const;
  const color = confettiColors[index % confettiColors.length];
  return (
    <Animated.View
      style={[
        styles.piece,
        { left, backgroundColor: color, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-20, CONFETTI_FALL_PX] }) }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  confetti: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 5 },
  piece: { position: 'absolute', top: 0, width: 8, height: 8 },
  banner: { height: 200, borderWidth: border.width, overflow: 'hidden', marginTop: 10 },
  trophyWrap: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center' },
  body: { borderWidth: border.width, borderTopWidth: 0, backgroundColor: colors.cd, padding: 18, gap: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reveal: { backgroundColor: colors.deep, borderWidth: border.thin, borderColor: colors.ac, padding: 12, gap: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
});
