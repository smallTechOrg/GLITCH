// Hero select (v3 `heroSel`, lines 366–373): module scene backdrop, four hero cards (sprite,
// name, power chip, description), "▶ Enter the <Module>" and "← HOME".
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HERO_IDS, type HeroId, type ModuleId } from '../contracts/ids';
import { Icon } from '../art/Icon';
import { Scene } from '../art/Scene';
import { Sprite } from '../art/Sprite';
import { HEROES, POWER_ICON } from '../content/heroes';
import { getModule } from '../content/modules';
import { advanceTarget, heroOf, isModuleOpen } from '../engine/progression';
import { chooseHero } from '../state/actions';
import { useGlitchStore } from '../state/store';
import { border, colors, fontSize, layout, shadows } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { useFocusRing } from '../ui/focus';
import { HERO_SELECT } from './copy';
import { LockedScreen } from './LockedScreen';
import { goFlow, goHome } from './nav';

export function HeroSelectScreen({ mod }: { mod: ModuleId }): React.JSX.Element {
  const m = getModule(mod);
  const open = useGlitchStore((s) => isModuleOpen(s, mod));
  const [sel, setSel] = useState<HeroId>(() => heroOf(useGlitchStore.getState(), mod));
  if (!open) return <LockedScreen />;

  const enter = (): void => {
    chooseHero(mod, sel, new Date());
    goFlow(advanceTarget(useGlitchStore.getState(), mod));
  };

  return (
    <Page testID="hero-screen">
      <View style={styles.bg} pointerEvents="none">
        <Scene id={m.scene} ambient filter="half" />
      </View>
      <View style={styles.inner}>
        <PixelText size={fontSize.tiny} color={colors.ac}>{HERO_SELECT.eyebrow(m.id, m.title)}</PixelText>
        <PixelText size={fontSize.h2} color={colors.ac} bold accessibilityRole="header">{HERO_SELECT.heading}</PixelText>
        <PixelText long size={fontSize.small} color={colors.mu} style={styles.sub}>{HERO_SELECT.sub}</PixelText>
        <View style={styles.cards} accessibilityRole="radiogroup">
          {HERO_IDS.map((id) => (
            <HeroCard key={id} id={id} selected={id === sel} onPress={() => setSel(id)} />
          ))}
        </View>
        <PixelButton testID="hero-enter" variant="primary" label={HERO_SELECT.enter(m.title)} onPress={enter} style={styles.go} />
        <PixelButton testID="hero-back" variant="link" label={HERO_SELECT.back} onPress={goHome} />
      </View>
    </Page>
  );
}

function HeroCard({ id, selected, onPress }: { id: HeroId; selected: boolean; onPress(): void }): React.JSX.Element {
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
      style={[styles.card, { borderColor: selected ? h.color : colors.ln }, selected ? styles.sel : null, f.ring]}
    >
      <Sprite id={id} scale={5} animate={selected ? 'bob' : 'none'} />
      <PixelText size={fontSize.h3} bold color={h.color}>{h.name}</PixelText>
      <View style={styles.power}>
        <Icon name={POWER_ICON[h.power]} scale={2} />
        <PixelText size={fontSize.tiny} color={colors.ac}>{h.powerName}</PixelText>
      </View>
      <PixelText long size={fontSize.tiny} color={colors.mu} style={styles.center}>{h.description}</PixelText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bg: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, opacity: 0.5 },
  inner: { alignItems: 'center', gap: 6, paddingTop: 20 },
  sub: { marginBottom: 18, textAlign: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', alignSelf: 'stretch' },
  card: {
    flexGrow: 1, flexBasis: 180, maxWidth: 220, minHeight: layout.minTouch, alignItems: 'center', gap: 8, padding: 14,
    backgroundColor: colors.cd, borderWidth: border.width, boxShadow: shadows.item,
  },
  sel: { backgroundColor: colors.ln, transform: [{ translateY: -4 }] },
  power: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingHorizontal: 6, backgroundColor: colors.deep },
  center: { textAlign: 'center' },
  go: { marginTop: 20 },
});
