// Sticky top bar (v3 `renderTop`, line 295): GLITCH logo → Home, HOME, streak chip, LVL + XP
// bar, hero head, SETTINGS (replaces v3 LOG OUT). Hidden on welcome + storytime by the layout.
import React from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { SETTINGS_HREF } from '../contracts/routes';
import { Icon } from '../art/Icon';
import { Sprite } from '../art/Sprite';
import { HEROES } from '../content/heroes';
import { levelOf, xpIntoLevel } from '../engine/xp';
import { useGlitchStore } from '../state/store';
import { border, colors, fontSize } from '../theme/tokens';
import { Bar } from '../ui/Bar';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { useFocusRing } from '../ui/focus';
import { goHome, goTo } from './nav';

export function TopBar(): React.JSX.Element {
  const xp = useGlitchStore((s) => s.xp);
  const streak = useGlitchStore((s) => s.streak.current);
  const hero = useGlitchStore((s) => s.lastHero);
  const f = useFocusRing();
  const lvl = levelOf(xp);
  const into = xpIntoLevel(xp);
  return (
    <View testID="topbar" style={styles.bar} accessibilityRole="toolbar">
      <Pressable onPress={goHome} accessibilityRole="link" accessibilityLabel="GLITCH home" onFocus={f.onFocus} onBlur={f.onBlur} style={[styles.logoBtn, f.ring]}>
        <PixelText size={fontSize.logo} color={colors.ac} style={styles.logo}>GLITCH</PixelText>
      </Pressable>
      <PixelButton testID="topbar-home" variant="small" label="HOME" onPress={goHome} />
      <View style={styles.right}>
        <View testID="streak-chip" accessible accessibilityLabel={`Day streak ${streak}`} style={styles.chip}>
          <Icon name="flame" scale={2} />
          <PixelText size={fontSize.small} color={colors.ac}>{String(streak)}</PixelText>
        </View>
        <View style={[styles.chip, styles.xp]} accessible accessibilityLabel={`Level ${lvl}, ${into} of 100 XP`}>
          <View style={styles.xl}>
            <PixelText testID="xp-level" size={fontSize.tiny} bold>{`LVL ${lvl}`}</PixelText>
            <PixelText testID="xp-text" size={fontSize.tiny}>{`${into}/100 XP`}</PixelText>
          </View>
          <Bar value={into / 100} height={6} />
        </View>
        <Sprite id={hero} crop="head" scale={3} accessibilityLabel={`Hero ${HEROES[hero].name}`} />
        <PixelButton testID="topbar-settings" variant="small" label="SETTINGS" icon="gear" onPress={() => goTo(SETTINGS_HREF)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, flexWrap: 'wrap',
    backgroundColor: colors.deep, borderBottomWidth: border.width, borderBottomColor: colors.ln, zIndex: 50,
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as unknown as ViewStyle) : {}),
  },
  logoBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  logo: { textShadowColor: colors.logoShadow, textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, borderWidth: border.thin, borderColor: colors.ln, backgroundColor: colors.cd },
  xp: { flexDirection: 'column', alignItems: 'stretch', gap: 3, minWidth: 120 },
  xl: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
