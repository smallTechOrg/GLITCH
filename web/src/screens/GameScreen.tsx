// Game Frame (v3 `gameStart`/`hud`/`say`/`usePower`/`miss`/`fail`/`win`, lines 467–487;
// game-runtime.md). Owns hearts, hero power (2 uses), shield, speech bubble, Out-of-hearts
// and Win screens; games only talk to it through the frozen GameApi. Session rules are the
// pure functions in engine/session.ts; progress rewards go through state/actions.ts.
// Phase 2: on a REPLAY of a cleared content game the frame asks features/variations for a
// fresh case file (NOVA thinking while it loads, "NEW CASE FILE" tag, v3 fallback + note).
// Phase 3: every accepted miss that carries a Mistake payload is recorded for this run
// (recap), remembered on the device (features/memory) and offered to ASK NOVA WHY.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GameId, ModuleId, Mood } from '../contracts/ids';
import type { GameApi, Mistake, PowerHandlers, SessionMistake } from '../contracts/game';
import { Icon } from '../art/Icon';
import { Scene } from '../art/Scene';
import { Sprite } from '../art/Sprite';
import { HEROES, POWER_ICON } from '../content/heroes';
import { getModule } from '../content/modules';
import { GAMES } from '../games/registry';
import { advanceTarget, heroOf, isLastOpenStep, isStepDone, isStepStartable } from '../engine/progression';
import type { WinRewards } from '../engine/rewards';
import {
  DEFAULT_MISS, WIN_LINE, applyMiss, applyPower, applyWin, canUsePower, commitPower, createSession, heartsLabel, isOver, powerLabel,
  START_HEARTS, type GameSession,
} from '../engine/session';
import { announce } from '../a11y/announce';
import { ANIM, BOB_PX } from '../a11y/stepped';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { bobTransform, useStepAnimation } from '../a11y/useStepAnimation';
import { recordPowerUse, startGame, winGame } from '../state/actions';
import { useGlitchStore } from '../state/store';
import { CaseFileBadge, CaseFileLoading, ScenarioGame, useCaseFile } from '../features/variations';
import { AskNovaWhy, type Explanation } from '../features/tutor/AskNovaWhy';
import { ASK_WINDOW_MS } from '../features/tutor/copy';
import { MistakeRecap } from '../features/recap/MistakeRecap';
import { onGameWon, rememberMistake } from '../features/memory';
import { border, colors, fontSize, layout } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { SpeechBubble } from '../ui/SpeechBubble';
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

/** The run's latest recorded mistake, for the ask chip. */
interface LatestMistake {
  index: number; // position in this run's mistake list (component key)
  seq: number; // frame-lifetime counter (chip-window timer identity)
  mistake: SessionMistake;
  bubbleV: number; // bubble version the miss produced; any later say/miss/win hides the chip
  atMs: number;
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
  const bubbleVRef = useRef(0);
  const handlersRef = useRef<PowerHandlers>({});
  const [shakeN, setShakeN] = useState(0);
  const [won, setWon] = useState<WinState | null>(null);
  const caseFile = useCaseFile(gameId);
  const file = caseFile.state.status === 'ready' ? caseFile.state.file : null;
  const fileRef = useRef(file);
  fileRef.current = file;

  // Phase 3 run-scoped mistake state (cleared by restart()).
  const mistakesRef = useRef<SessionMistake[]>([]);
  const [mistakes, setMistakes] = useState<readonly SessionMistake[]>([]);
  const [latest, setLatest] = useState<LatestMistake | null>(null);
  const latestSeqRef = useRef(0);
  const [askExpired, setAskExpired] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Readonly<Record<string, Explanation>>>({});

  // Starting a game (and every retry/replay) marks its hero as played.
  useEffect(() => {
    startGame(hero, new Date());
  }, [run, hero]);

  const say = useCallback((text: string, mood: Mood = 'neutral') => {
    bubbleVRef.current += 1;
    setBubble({ text, mood, v: bubbleVRef.current });
  }, []);

  // Accepted miss + payload → this run's list, device memory and the ask chip's latest mistake.
  const recordMistake = useCallback(
    (mistake: Mistake, message: string | undefined, shielded: boolean) => {
      const f = fileRef.current;
      const record: SessionMistake = {
        ...mistake,
        gameId,
        variationId: f && f.kind === 'variation' ? f.variationId : 'v3',
        message: message || DEFAULT_MISS,
        shielded,
        at: new Date().toISOString(),
      };
      const index = mistakesRef.current.length;
      mistakesRef.current = [...mistakesRef.current, record];
      setMistakes(mistakesRef.current);
      rememberMistake(record);
      latestSeqRef.current += 1;
      setLatest({ index, seq: latestSeqRef.current, mistake: record, bubbleV: bubbleVRef.current, atMs: Date.now() });
    },
    [gameId],
  );

  const onExplained = useCallback((key: string, e: Explanation) => {
    setExplanations((prev) => ({ ...prev, [key]: { text: e.text, tip: e.tip } }));
  }, []);

  // The chip window: at most ASK_WINDOW_MS after the latest mistake.
  useEffect(() => {
    if (!latest) return undefined;
    const t = setTimeout(() => setAskExpired(latest.seq), Math.max(0, ASK_WINDOW_MS - (Date.now() - latest.atMs)));
    return () => clearTimeout(t);
  }, [latest]);

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
      miss(message?: string, mistake?: Mistake) {
        if (!live()) return;
        const shielded = sessionRef.current.shield;
        const r = applyMiss(sessionRef.current, message);
        if (!r.line) return;
        setSession(r.session);
        say(r.line.text, r.line.mood);
        if (mistake) recordMistake(mistake, message, shielded);
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
        onGameWon(gameId, rewards.stars);
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
  }, [run, hero, gameId, say, setSession, recordMistake]);

  const pressPower = (): void => {
    const s = sessionRef.current;
    if (!canUsePower(s) || !file) return;
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
    mistakesRef.current = [];
    setMistakes([]);
    setLatest(null);
    setExplanations({});
    say(def.intro, 'neutral');
    setRun(runRef.current);
  };

  // REPLAY from the win screen: the game is cleared now, so the next session may be a fresh
  // case file. Retry after a fail keeps the case file in play.
  const replay = (): void => {
    caseFile.next();
    restart();
  };

  const shake = useStepAnimation({ ...ANIM.shake, play: shakeN > 0, trigger: shakeN, restValue: 0 });
  const shakeStyle = {
    transform: [{ translateX: shake.interpolate({ inputRange: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1], outputRange: [0, -6, 6, -6, 6, -3, 0] }) }],
  };

  // ASK NOVA WHY sits under the bubble (outside its live region) for the latest mistake.
  const chipVisible = latest !== null && bubble.v === latest.bubbleV && askExpired !== latest.seq;
  const bubbleView = (
    <View style={narrow ? styles.sayNarrow : styles.say}>
      <SpeechBubble text={bubble.text} mood={bubble.mood} version={bubble.v} />
      {latest && latest.mistake.explain !== false ? (
        <View style={styles.ask}>
          <AskNovaWhy key={`${run}-${latest.index}`} mistake={latest.mistake} chipVisible={chipVisible} onExplained={onExplained} />
        </View>
      ) : null}
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
          disabled={!canUsePower(session) || !file}
          accessibilityLabel={powerLabel(session)}
          accessibilityHint={GAME.heroAlt}
          onPress={pressPower}
        >
          <PixelText size={fontSize.tiny} color={colors.ac}>{`x${session.powerUses}`}</PixelText>
        </PixelButton>
      </View>

      <Animated.View testID="game-body" style={[styles.body, shakeStyle]}>
        {failed ? (
          <FailView onRetry={restart} mistakes={mistakes} explanations={explanations} />
        ) : won ? (
          <WinView gameId={gameId} mod={mod} win={won} onReplay={replay} mistakes={mistakes} explanations={explanations} />
        ) : !file ? (
          <CaseFileLoading />
        ) : (
          <View style={styles.play}>
            <CaseFileBadge file={file} />
            {file.kind === 'variation' ? (
              <ScenarioGame key={`${run}-${file.variationId}`} game={file.game} api={api} />
            ) : (
              <def.Component key={run} api={api} />
            )}
          </View>
        )}
      </Animated.View>
    </Page>
  );
}

function Bob({ children }: { children: React.ReactNode }): React.JSX.Element {
  const v = useStepAnimation({ ...ANIM.bob, loop: true });
  return <Animated.View style={bobTransform(v, BOB_PX)}>{children}</Animated.View>;
}

interface RecapData {
  mistakes: readonly SessionMistake[];
  explanations: Readonly<Record<string, Explanation>>;
}

function FailView({ onRetry, mistakes, explanations }: { onRetry(): void } & RecapData): React.JSX.Element {
  return (
    <View testID="fail-screen" style={styles.res}>
      <Icon name="heart0" scale={10} />
      <PixelText size={fontSize.h2} color={colors.no} bold accessibilityRole="header">{GAME.failTitle}</PixelText>
      <PixelText long size={fontSize.small} color={colors.mu} style={styles.center}>{GAME.failText}</PixelText>
      <MistakeRecap mistakes={mistakes} explanations={explanations} />
      <View style={styles.buttons}>
        <PixelButton testID="fail-retry" variant="primary" label={GAME.retry} onPress={onRetry} />
        <PixelButton testID="fail-home" label={GAME.home} onPress={goHome} />
      </View>
    </View>
  );
}

function WinView({
  gameId, mod, win, onReplay, mistakes, explanations,
}: { gameId: GameId; mod: ModuleId; win: WinState; onReplay(): void } & RecapData): React.JSX.Element {
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
      <MistakeRecap mistakes={mistakes} explanations={explanations} />
      <View style={styles.buttons}>
        <PixelButton
          testID="win-continue"
          variant="primary"
          label={lastStep ? GAME.finishModule : GAME.continue}
          onPress={() => goFlow(advanceTarget(useGlitchStore.getState(), mod))}
        />
        <PixelButton testID="win-replay" label={GAME.replay} onPress={onReplay} />
      </View>
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
  ask: { marginTop: 8, alignSelf: 'flex-start' },
  hud: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 10,
    backgroundColor: colors.cd, borderWidth: border.width, borderTopWidth: 0, borderColor: colors.ln,
  },
  hearts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shield: { marginLeft: 6 },
  goal: { flex: 1, minWidth: 160 },
  body: { marginTop: 14 },
  play: { gap: 10 },
  res: { alignItems: 'center', gap: 14, paddingVertical: 24, paddingHorizontal: 12, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln },
  center: { textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 8 },
  reveal: { alignSelf: 'stretch', backgroundColor: colors.deep, borderWidth: border.thin, borderColor: colors.ac, padding: 12, gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
});
