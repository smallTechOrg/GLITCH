// Game Frame (v3 `gameStart`/`hud`/`say`/`usePower`/`miss`/`fail`/`win`, lines 467–487;
// game-runtime.md). Owns hearts, hero power (2 uses), shield, speech bubble, Out-of-hearts
// and Win screens; games only talk to it through the frozen GameApi. Session rules are the
// pure functions in engine/session.ts; progress rewards go through state/actions.ts.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GameId, ModuleId, Mood } from '../contracts/ids';
import type { GameApi, PowerHandlers } from '../contracts/game';
import { Icon } from '../art/Icon';
import { Scene } from '../art/Scene';
import { Sprite } from '../art/Sprite';
import { HEROES, POWER_ICON } from '../content/heroes';
import { getModule } from '../content/modules';
import { GAMES } from '../games/registry';
import { advanceTarget, heroOf, isLastOpenStep, isStepDone, isStepStartable } from '../engine/progression';
import type { WinRewards } from '../engine/rewards';
import {
  WIN_LINE, applyMiss, applyPower, applyWin, canUsePower, commitPower, createSession, heartsLabel, isOver, powerLabel,
  START_HEARTS, type GameSession,
} from '../engine/session';
import { announce } from '../a11y/announce';
import { ANIM, BOB_PX } from '../a11y/stepped';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { bobTransform, useStepAnimation } from '../a11y/useStepAnimation';
import { recordPowerUse, startGame, winGame } from '../state/actions';
import { useGlitchStore } from '../state/store';
import { border, colors, fontSize, layout } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { SpeechBubble } from '../ui/SpeechBubble';
import { StubBadge } from '../ui/StubBadge';
import { Tag } from '../ui/Tag';
import { toast } from '../ui/toast';
import { GAME } from './copy';
import { LockedScreen } from './LockedScreen';
import { goFlow, goHome } from './nav';

export function GameScreen({ mod, gameId }: { mod: ModuleId; gameId: GameId }): React.JSX.Element {
  // course-shell.md: a step is startable when every earlier step of its module is done;
  // done steps stay replayable. Deep links to anything else get the locked screen.
  const open = useGlitchStore((s) => isStepDone(s, gameId) || isStepStartable(s, gameId));
  if (!open) return <LockedScreen />;
  return <GameFrame mod={mod} gameId={gameId} />;
}

interface Bubble {
  text: string;
  mood: Mood;
  v: number;
}

interface WinState {
  rewards: WinRewards;
  summary?: string;
}

function GameFrame({ mod, gameId }: { mod: ModuleId; gameId: GameId }): React.JSX.Element {
  const def = GAMES[gameId];
  const m = getModule(mod);
  const [hero] = useState(() => heroOf(useGlitchStore.getState(), mod));
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const { width } = useWindowDimensions();
  const narrow = width <= layout.mobileBreakpoint;

  const [run, setRun] = useState(0);
  const runRef = useRef(0);
  const sessionRef = useRef<GameSession>(createSession(gameId, hero));
  const [session, setSessionState] = useState<GameSession>(sessionRef.current);
  const setSession = useCallback((s: GameSession) => {
    sessionRef.current = s;
    setSessionState(s);
  }, []);
  const [bubble, setBubble] = useState<Bubble>({ text: def.intro, mood: 'neutral', v: 0 });
  const handlersRef = useRef<PowerHandlers>({});
  const [shakeN, setShakeN] = useState(0);
  const [won, setWon] = useState<WinState | null>(null);

  // Starting a game (and every retry/replay) marks its hero as played.
  useEffect(() => {
    startGame(hero, new Date());
  }, [run, hero]);

  const say = useCallback((text: string, mood: Mood = 'neutral') => setBubble((b) => ({ text, mood, v: b.v + 1 })), []);

  const api = useMemo<GameApi>(() => {
    const myRun = run;
    const live = (): boolean => runRef.current === myRun; // stale timers from a previous run are ignored
    return {
      get hero() {
        return hero;
      },
      get hearts() {
        return sessionRef.current.hearts;
      },
      get over() {
        return !live() || isOver(sessionRef.current);
      },
      get reducedMotion() {
        return reducedRef.current;
      },
      say(text: string, mood?: Mood) {
        if (live()) say(text, mood);
      },
      miss(message?: string) {
        if (!live()) return;
        const r = applyMiss(sessionRef.current, message);
        if (!r.line) return;
        setSession(r.session);
        say(r.line.text, r.line.mood);
        if (r.shake) setShakeN((n) => n + 1);
        if (r.failed) announce(GAME.failAnnounce);
      },
      win(summary?: string) {
        if (!live()) return;
        const r = applyWin(sessionRef.current);
        if (!r.accepted) return;
        setSession(r.session);
        const rewards = winGame(gameId, r.session.hearts, r.session.lost, new Date());
        setWon({ rewards, summary });
        say(WIN_LINE, 'good');
        announce(GAME.winAnnounce(rewards.stars));
      },
      registerPowers(h: PowerHandlers) {
        if (live()) handlersRef.current = h;
      },
      toast(text: string) {
        if (live()) toast(text);
      },
    };
  }, [run, hero, gameId, say, setSession]);

  const pressPower = (): void => {
    const s = sessionRef.current;
    if (!canUsePower(s)) return;
    const kind = HEROES[hero].power;
    const r = applyPower(s, handlersRef.current, kind);
    if (!r.consumed) {
      if (r.toast) toast(r.toast);
      return;
    }
    setSession(commitPower(sessionRef.current, r, kind));
    if (r.line) say(r.line.text, r.line.mood);
    recordPowerUse(hero, new Date());
  };

  const restart = (): void => {
    runRef.current += 1;
    handlersRef.current = {};
    setSession(createSession(gameId, hero));
    setWon(null);
    setBubble((b) => ({ text: def.intro, mood: 'neutral', v: b.v + 1 }));
    setRun(runRef.current);
  };

  const shake = useStepAnimation({ ...ANIM.shake, play: shakeN > 0, trigger: shakeN, restValue: 0 });
  const shakeStyle = {
    transform: [{ translateX: shake.interpolate({ inputRange: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1], outputRange: [0, -6, 6, -6, 6, -3, 0] }) }],
  };

  // The Phase-1 ASK NOVA WHY stub sits under the bubble after a mistake (outside its live region).
  const bubbleView = (
    <View style={narrow ? styles.sayNarrow : styles.say}>
      <SpeechBubble text={bubble.text} mood={bubble.mood} version={bubble.v} />
      {bubble.mood === 'bad' ? <StubBadge testID="ask-nova-why-stub" label={GAME.askNovaWhy} style={styles.stub} /> : null}
    </View>
  );
  const h = HEROES[hero];
  const failed = session.status === 'failed';

  return (
    <Page testID="game-screen">
      <View style={[styles.banner, { borderColor: m.color }]}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Scene id={m.scene} ambient />
        </View>
        <View style={styles.gtag}>
          <PixelText size={fontSize.tiny} color={colors.ac}>{GAME.tagLine(m.id, m.title)}</PixelText>
          <PixelText testID="game-title" size={fontSize.h3} color={colors.white} bold accessibilityRole="header">{def.title}</PixelText>
        </View>
        {narrow ? bubbleView : null}
        <View style={styles.chars}>
          <Sprite id={hero} scale={4} animate="bob" accessibilityLabel={`Hero ${h.name}`} />
          {narrow ? <View style={styles.flex} /> : bubbleView}
          <Sprite id={m.npc} scale={4} />
        </View>
      </View>

      <View style={styles.hud}>
        <View testID="hearts" accessible accessibilityRole="image" accessibilityLabel={heartsLabel(session)} style={styles.hearts}>
          {Array.from({ length: START_HEARTS }, (_, i) => (
            <Icon key={i} name={i < session.hearts ? 'heart' : 'heart0'} scale={3} />
          ))}
          {session.shield ? (
            <View testID="shield-indicator" style={styles.shield}>
              <Icon name="shield" scale={3} />
            </View>
          ) : null}
        </View>
        <PixelText testID="game-goal" size={fontSize.tiny} color={colors.mu} style={styles.goal}>{def.goal}</PixelText>
        <PixelButton
          testID="power-button"
          label={h.powerName}
          icon={POWER_ICON[h.power]}
          variant="secondary"
          color={m.color}
          disabled={!canUsePower(session)}
          accessibilityLabel={powerLabel(session)}
          accessibilityHint={GAME.heroAlt}
          onPress={pressPower}
        >
          <PixelText size={fontSize.tiny} color={colors.ac}>{`x${session.powerUses}`}</PixelText>
        </PixelButton>
      </View>

      <Animated.View testID="game-body" style={[styles.body, shakeStyle]}>
        {failed ? (
          <FailView onRetry={restart} />
        ) : won ? (
          <WinView gameId={gameId} mod={mod} win={won} onReplay={restart} />
        ) : (
          <def.Component key={run} api={api} />
        )}
      </Animated.View>
    </Page>
  );
}

function Bob({ children }: { children: React.ReactNode }): React.JSX.Element {
  const v = useStepAnimation({ ...ANIM.bob, loop: true });
  return <Animated.View style={bobTransform(v, BOB_PX)}>{children}</Animated.View>;
}

function FailView({ onRetry }: { onRetry(): void }): React.JSX.Element {
  return (
    <View testID="fail-screen" style={styles.res}>
      <Icon name="heart0" scale={10} />
      <PixelText size={fontSize.h2} color={colors.no} bold accessibilityRole="header">{GAME.failTitle}</PixelText>
      <PixelText long size={fontSize.small} color={colors.mu} style={styles.center}>{GAME.failText}</PixelText>
      <View style={styles.buttons}>
        <PixelButton testID="fail-retry" variant="primary" label={GAME.retry} onPress={onRetry} />
        <PixelButton testID="fail-home" label={GAME.home} onPress={goHome} />
      </View>
    </View>
  );
}

function WinView({ gameId, mod, win, onReplay }: { gameId: GameId; mod: ModuleId; win: WinState; onReplay(): void }): React.JSX.Element {
  const lastStep = useGlitchStore((s) => isLastOpenStep(s, gameId));
  const { stars, gameXp, flawlessXp } = win.rewards;
  return (
    <View testID="win-screen" style={styles.res}>
      <Bob>
        <Icon name="trophy" scale={10} />
      </Bob>
      <View testID="win-stars" accessible accessibilityRole="image" accessibilityLabel={GAME.stars(stars)} style={styles.stars}>
        {[0, 1, 2].map((i) => (
          <Icon key={i} name={i < stars ? 'star' : 'star0'} scale={5} />
        ))}
      </View>
      <PixelText size={fontSize.h2} color={colors.ac} bold accessibilityRole="header">{GAME.winTitle}</PixelText>
      {win.summary ? (
        <View style={styles.reveal}>
          <PixelText size={fontSize.tiny} color={colors.ac}>{GAME.learned}</PixelText>
          <PixelText long size={fontSize.small}>{win.summary}</PixelText>
        </View>
      ) : null}
      <View style={styles.tags}>
        {gameXp > 0 ? <Tag testID="win-xp-tag" label={GAME.xpTag(gameXp)} variant="good" /> : null}
        {flawlessXp > 0 ? <Tag testID="win-flawless-tag" label={GAME.flawlessTag(flawlessXp)} variant="good" /> : null}
      </View>
      <View style={styles.buttons}>
        <PixelButton
          testID="win-continue"
          variant="primary"
          label={lastStep ? GAME.finishModule : GAME.continue}
          onPress={() => goFlow(advanceTarget(useGlitchStore.getState(), mod))}
        />
        <PixelButton testID="win-replay" label={GAME.replay} onPress={onReplay} />
      </View>
      <StubBadge testID="win-soon-strip" label={GAME.soonStrip} style={styles.soon} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { minHeight: 200, borderWidth: border.width, overflow: 'hidden', padding: 12, gap: 10, justifyContent: 'space-between' },
  gtag: { alignSelf: 'flex-start', backgroundColor: colors.overlay, paddingVertical: 6, paddingHorizontal: 10, gap: 4 },
  chars: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  flex: { flex: 1 },
  say: { flex: 1, alignSelf: 'center' },
  sayNarrow: { alignSelf: 'stretch' },
  stub: { marginTop: 8, backgroundColor: colors.deep },
  hud: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 10,
    backgroundColor: colors.cd, borderWidth: border.width, borderTopWidth: 0, borderColor: colors.ln,
  },
  hearts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shield: { marginLeft: 6 },
  goal: { flex: 1, minWidth: 160 },
  body: { marginTop: 14 },
  res: { alignItems: 'center', gap: 14, paddingVertical: 24, paddingHorizontal: 12, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln },
  center: { textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 8 },
  reveal: { alignSelf: 'stretch', backgroundColor: colors.deep, borderWidth: border.thin, borderColor: colors.ac, padding: 12, gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  soon: { alignSelf: 'center', marginTop: 6 },
});
