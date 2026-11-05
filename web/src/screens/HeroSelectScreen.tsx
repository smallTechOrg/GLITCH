// Hero select: meet the crew. Four hero cards, and the hero you tap introduces themself and
// explains their power, then "▶ Enter the <Module>" and "← HOME".
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { spaceActivates } from '../a11y/spaceActivates';
import { HERO_IDS, type HeroId, type ModuleId } from '../contracts/ids';
import { displayName } from '../contracts/state';
import { Icon } from '../art/Icon';
import { Scene } from '../art/Scene';
import { Sprite } from '../art/Sprite';
import { HEROES, POWER_ICON } from '../content/heroes';
import { getModule, moduleNumber } from '../content/modules';
import { advanceTarget, heroOf, isModuleOpen } from '../engine/progression';
import { chooseHero } from '../state/actions';
import { useGlitchStore } from '../state/store';
import { border, colors, fontSize, layout, shadows } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { SpeechBubble } from '../ui/SpeechBubble';
import { useFocusRing } from '../ui/focus';
import { HERO_SELECT } from './copy';
import { LockedScreen } from './LockedScreen';
import { goFlow, goHome } from './nav';

export function HeroSelectScreen({ mod }: { mod: ModuleId }): React.JSX.Element {
  const m = getModule(mod);
  const open = useGlitchStore((s) => isModuleOpen(s, mod));
  const playerName = useGlitchStore((s) => displayName(s.profile.nickname));
  const [sel, setSel] = useState<HeroId>(() => heroOf(useGlitchStore.getState(), mod));
  const narrow = useWindowDimensions().width <= layout.mobileBreakpoint;
  if (!open) return <LockedScreen />;

  const enter = (): void => {
    chooseHero(mod, sel, new Date());
    goFlow(advanceTarget(useGlitchStore.getState(), mod));
  };
  const h = HEROES[sel];

  return (
    <Page testID="hero-screen" style={styles.page}>
      <PixelText size={fontSize.tiny} color={colors.ac}>{HERO_SELECT.eyebrow(moduleNumber(m.id), m.title)}</PixelText>
      <PixelText size={fontSize.h2} color={colors.ac} bold accessibilityRole="header">{HERO_SELECT.heading}</PixelText>
      <PixelText long size={fontSize.small} color={colors.mu} style={styles.center}>{HERO_SELECT.sub}</PixelText>
      <View style={styles.cards} accessibilityRole="radiogroup">
        {HERO_IDS.map((id) => (
          <HeroCard key={id} id={id} selected={id === sel} narrow={narrow} onPress={() => setSel(id)} />
        ))}
      </View>
      <View testID="hero-intro" style={[styles.intro, { borderColor: h.color }]}>
        <View style={styles.introArt}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Scene id={m.scene} ambient filter="half" />
          </View>
          <Sprite id={sel} scale={narrow ? 3 : 4} animate="talk" outlined />
        </View>
        <View style={styles.introText}>
          <SpeechBubble testID="hero-intro-text" text={`Hi ${playerName}! ${h.intro}`} version={HERO_IDS.indexOf(sel)} />
          <View style={styles.power}>
            <Icon name={POWER_ICON[h.power]} scale={2} />
            <PixelText size={fontSize.tiny} color={colors.ac}>{HERO_SELECT.power(h.powerName)}</PixelText>
            <PixelText long size={fontSize.tiny} color={colors.tx} style={styles.flex}>{h.description}</PixelText>
          </View>
        </View>
      </View>
      <PixelButton testID="hero-enter" variant="primary" label={HERO_SELECT.enter(m.title)} onPress={enter} />
      <PixelButton testID="hero-back" variant="link" label={HERO_SELECT.back} onPress={goHome} />
    </Page>
  );
}

function HeroCard({ id, selected, narrow, onPress }: { id: HeroId; selected: boolean; narrow: boolean; onPress(): void }): React.JSX.Element {
  const h = HEROES[id];
  const f = useFocusRing();
  return (
    <Pressable
      testID={`hero-card-${id}`}
      onPress={onPress}
      onFocus={f.onFocus}
      onBlur={f.onBlur}
      accessibilityRole="radio"
      accessibilityLabel={`${h.name}, ${h.powerName} power. ${h.description}`}
      accessibilityState={{ checked: selected, selected }}
      aria-checked={selected}
      {...spaceActivates(onPress)}
      style={[styles.card, { borderColor: selected ? h.color : colors.ln }, selected ? styles.sel : null, f.ring]}
    >
      <Sprite id={id} scale={narrow ? 2 : 3} animate={selected ? 'bob' : 'none'} />
      <PixelText size={fontSize.small} bold color={h.color}>{h.name}</PixelText>
      <View style={styles.chip}>
        <Icon name={POWER_ICON[h.power]} scale={1} />
        <PixelText size={fontSize.tiny} color={colors.ac}>{h.powerName}</PixelText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', gap: 6 },
  center: { textAlign: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', alignSelf: 'stretch' },
  card: { flexGrow: 1, flexBasis: '22%', minWidth: 130, maxWidth: 220, minHeight: layout.minTouch, alignItems: 'center', gap: 2, padding: 4, backgroundColor: colors.cd, borderWidth: border.width, boxShadow: shadows.item },
  sel: { backgroundColor: colors.ln },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, backgroundColor: colors.deep },
  intro: { flexDirection: 'row', gap: 8, padding: 6, backgroundColor: colors.cd, borderWidth: border.width, maxWidth: 760, width: '100%' },
  introArt: { width: 96, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  introText: { flex: 1, minWidth: 0, gap: 4 },
  power: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  flex: { flexShrink: 1, flexGrow: 1, flexBasis: 140 },
});
