// Home course map (v3 `menu`, lines 347–365): hero + greeting, stats, NOVA quest box,
// "COURSE · AI LITERACY" path of 4 module cards with steps, and the 12 badges. Phase 2: the
// AI energy meter under the stats (durable-ai-budget.md; same component as free-write).
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { stepHref } from '../contracts/routes';
import { displayName } from '../contracts/state';
import { Sprite } from '../art/Sprite';
import { BADGES } from '../content/badges';
import { MODULES } from '../content/modules';
import { badgesEarned } from '../engine/badges';
import { modulesDone, questBox } from '../engine/progression';
import { levelOf, xpIntoLevel } from '../engine/xp';
import { ReviewPanel } from '../features/memory/ReviewPanel';
import { runDaily } from '../state/actions';
import { useGlitchStore } from '../state/store';
import { border, colors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { StatTile } from '../ui/StatTile';
import { BadgeTile } from './BadgeTile';
import { HOME } from './copy';
import { HomeEnergy } from './HomeEnergy';
import { ModuleCard } from './ModuleCard';
import { goTo } from './nav';

export function HomeScreen(): React.JSX.Element {
  const s = useGlitchStore(
    useShallow((st) => ({
      nickname: st.profile.nickname, xp: st.xp, streak: st.streak, steps: st.steps, stars: st.stars,
      heroByModule: st.heroByModule, lastHero: st.lastHero, badges: st.badges,
    })),
  );
  // Daily streak/XP whenever Home gains focus (idempotent per local day).
  useEffect(() => {
    runDaily(new Date());
  }, []);

  const q = questBox(s);
  const earned = badgesEarned(s);
  return (
    <Page testID="home-screen">
      <View style={styles.hero}>
        <Sprite id={s.lastHero} scale={5} animate="bob" />
        <View style={styles.hello}>
          <PixelText size={fontSize.tiny} color={colors.ac}>{HOME.eyebrow}</PixelText>
          <PixelText testID="home-greeting" size={fontSize.h2} color={colors.ac} bold accessibilityRole="header">{displayName(s.nickname)}</PixelText>
          <PixelText long size={fontSize.small} color={colors.mu}>{HOME.sub}</PixelText>
        </View>
      </View>

      <View style={styles.stats}>
        <StatTile testID="home-stat-level" value={`LVL ${levelOf(s.xp)}`} label={HOME.levelLabel(xpIntoLevel(s.xp))} />
        <StatTile testID="home-stat-xp" value={String(s.xp)} label={HOME.totalXp} />
        <StatTile testID="home-stat-streak" icon="flame" value={String(s.streak.current)} label={HOME.streakLabel(s.streak.best)} />
        <StatTile testID="home-stat-modules" value={`${modulesDone(s)}/${MODULES.length}`} label={HOME.modulesLabel} />
      </View>
      <View style={styles.energy}>
        <HomeEnergy />
      </View>
      <ReviewPanel />

      <View testID="home-quest" style={styles.quest}>
        <Sprite id="n" scale={3} animate="bob" />
        <View style={styles.qt}>
          <PixelText size={fontSize.tiny} color={colors.ac}>{q.eyebrow}</PixelText>
          <PixelText long size={fontSize.small}>{q.text}</PixelText>
        </View>
        <PixelButton testID="home-quest-button" variant="primary" label={q.button} accessibilityLabel={`${q.button.replace('▶ ', '')}: ${q.text}`} onPress={() => goTo(stepHref(q.step))} />
      </View>

      <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header" style={styles.sec}>{HOME.course}</PixelText>
      <PixelText long size={fontSize.small} color={colors.mu}>{HOME.courseSub}</PixelText>
      <View style={styles.path}>
        {MODULES.map((m) => (
          <ModuleCard key={m.id} mod={m} state={s} />
        ))}
      </View>

      <PixelText testID="badges-count" size={fontSize.h3} color={colors.ac} bold accessibilityRole="header" style={styles.sec}>{HOME.badges(earned, BADGES.length)}</PixelText>
      <PixelText long size={fontSize.small} color={colors.mu}>{HOME.badgesSub}</PixelText>
      <View style={styles.badges}>
        {BADGES.map((b) => (
          <BadgeTile key={b.id} badge={b} unlocked={!!s.badges[b.id]} />
        ))}
      </View>
      <PixelText size={fontSize.tiny} color={colors.mu} style={styles.foot}>{HOME.foot}</PixelText>
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: 20, alignItems: 'center', marginVertical: 16 },
  hello: { flex: 1, gap: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 14 },
  energy: { marginTop: -4, marginBottom: 4 },
  quest: { flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap', backgroundColor: colors.ln, borderWidth: border.width, borderColor: colors.ac, paddingVertical: 12, paddingHorizontal: 16, marginVertical: 14 },
  qt: { flex: 1, minWidth: 200 },
  sec: { marginTop: 30, marginBottom: 4 },
  path: { gap: 20, marginTop: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  foot: { textAlign: 'center', marginTop: 18 },
});
