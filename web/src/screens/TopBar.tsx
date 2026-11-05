// Top bar (v3 `renderTop`, line 295): GLITCH logo → Home, HOME, streak chip, LVL + XP bar, hero
// head, SETTINGS. One row at every width. Hidden on welcome + storytime by the layout.
import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SETTINGS_HREF } from '../contracts/routes';
import { Icon } from '../art/Icon';
import { Sprite } from '../art/Sprite';
import { HEROES } from '../content/heroes';
import { levelOf, xpIntoLevel } from '../engine/xp';
import { useGlitchStore } from '../state/store';
import { border, colors, fontSize, layout } from '../theme/tokens';
import { Bar } from '../ui/Bar';
import { GlitchLogo } from '../ui/GlitchLogo';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { useFocusRing } from '../ui/focus';
import { goHome, goTo } from './nav';

export function TopBar(): React.JSX.Element {
  const xp = useGlitchStore((s) => s.xp);
  const streak = useGlitchStore((s) => s.streak.current);
  const hero = useGlitchStore((s) => s.lastHero);
  const f = useFocusRing();
  // ≤ mobile breakpoint: icon-only SETTINGS and no hero head, so one row fits a 320 px screen.
  const narrow = useWindowDimensions().width <= layout.mobileBreakpoint;
  const lvl = levelOf(xp);
  const into = xpIntoLevel(xp);
  return (
    <View testID="topbar" style={[styles.bar, narrow ? styles.barNarrow : null]} accessibilityRole="toolbar">
      <Pressable onPress={goHome} accessibilityRole="link" accessibilityLabel="GLITCH home" onFocus={f.onFocus} onBlur={f.onBlur} style={[styles.logoBtn, f.ring]}>
        <GlitchLogo size={narrow ? 13 : fontSize.logo} testID="topbar-logo" />
      </Pressable>
      <PixelButton testID="topbar-home" variant="small" label="HOME" onPress={goHome} style={narrow ? styles.homeNarrow : null} />
      <View style={styles.right}>
        <View testID="streak-chip" accessible accessibilityLabel={`Day streak ${streak}`} style={styles.chip}>
          <Icon name="flame" scale={2} />
          <PixelText size={fontSize.small} color={colors.ac}>{String(streak)}</PixelText>
        </View>
        <View style={[styles.chip, styles.xp, narrow ? styles.xpNarrow : null]} accessible accessibilityLabel={`Level ${lvl}, ${into} of 100 XP`}>
          <View style={styles.xl}>
            <PixelText testID="xp-level" size={fontSize.tiny} bold>{`LVL ${lvl}`}</PixelText>
            {narrow ? null : <PixelText testID="xp-text" size={fontSize.tiny}>{`${into}/100 XP`}</PixelText>}
          </View>
          <Bar value={into / 100} height={4} />
        </View>
        {narrow ? null : <Sprite id={hero} crop="head" scale={2} accessibilityLabel={`Hero ${HEROES[hero].name}`} />}
        <PixelButton testID="topbar-settings" variant="small" label="SETTINGS" icon="gear" iconOnly={narrow} onPress={() => goTo(SETTINGS_HREF)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2, paddingHorizontal: 14, backgroundColor: colors.deep, borderBottomWidth: border.width, borderBottomColor: colors.ln, zIndex: 50 },
  barNarrow: { gap: 4, paddingHorizontal: 4 },
  logoBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  homeNarrow: { paddingHorizontal: 4, minWidth: 40 },
  right: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6, borderWidth: border.thin, borderColor: colors.ln, backgroundColor: colors.cd },
  xp: { flexDirection: 'column', alignItems: 'stretch', gap: 2, minWidth: 104, flexShrink: 1 },
  xpNarrow: { minWidth: 0, flexShrink: 0 },
  xl: { flexDirection: 'row', justifyContent: 'space-between', columnGap: 8 },
});
