// Game Frame (game-runtime.md): one screen with no scrolling. HUD on top, the mission always in
// view, characters and speech bubble beside the activity (above it on narrow screens). Owns
// hearts, hero power, shield, speech bubble, the mission brief, Out-of-hearts and Win screens;
// games only talk to it through the frozen GameApi. Session rules are the pure functions in
// engine/session.ts; progress rewards go through state/actions.ts.
// Phase 2: on a REPLAY of a cleared content game the frame asks features/variations for a
// fresh case file (NOVA thinking while it loads, "NEW CASE FILE" tag, v3 fallback + note).
// Phase 3: every accepted miss that carries a Mistake payload is recorded for this run
// (recap), remembered on the device (features/memory) and offered to ASK NOVA WHY.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GameId, ModuleId, Mood } from '../contracts/ids';
import type { GameApi, Mistake, PowerHandlers, SessionMistake } from '../contracts/game';
import { displayName } from '../contracts/state';
import { Icon } from '../art/Icon';
import { Sprite } from '../art/Sprite';
import { HEROES, POWER_ICON } from '../content/heroes';
import { getModule, moduleNumber } from '../content/modules';
import { GAMES } from '../games/registry';
import { adaptFor } from '../engine/adapt';
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
import { HeartBreak } from '../ui/HeartBreak';
import { Page } from '../ui/Page';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { SpeechBubble } from '../ui/SpeechBubble';
import { Tag } from '../ui/Tag';
import { toast } from '../ui/toast';
import { GAME } from './copy';
import { LockedScreen } from './LockedScreen';
import { MissionBrief } from './MissionBrief';
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
  const [adaptation] = useState(() => adaptFor(useGlitchStore.getState(), gameId));
  const playerName = useGlitchStore((s) => displayName(s.profile.nickname));
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const { width } = useWindowDimensions();
  const side = width >= layout.sideBySide;
  const narrow = width <= layout.mobileBreakpoint;

  const [run, setRun] = useState(0);
  const runRef = useRef(0);
  const sessionRef = useRef<GameSession>(createSession(gameId, hero, adaptation.powerUses));
  const [session, setSessionState] = useState<GameSession>(sessionRef.current);
  const setSession = useCallback((s: GameSession) => {
    sessionRef.current = s;
    setSessionState(s);
  }, []);
  const [bubble, setBubble] = useState<Bubble>({ text: def.intro, mood: 'neutral', v: 0 });
  const bubbleVRef = useRef(0);
  const handlersRef = useRef<PowerHandlers>({});
  const [shakeN, setShakeN] = useState(0);
  const [breakN, setBreakN] = useState(0);
  const [won, setWon] = useState<WinState | null>(null);
  const [briefOpen, setBriefOpen] = useState(() => !isStepDone(useGlitchStore.getState(), gameId));
  const [started, setStarted] = useState(!briefOpen);
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
        const heartsBefore = sessionRef.current.hearts;
        const r = applyMiss(sessionRef.current, message);
        if (!r.line) return;
        setSession(r.session);
        say(r.line.text, r.line.mood);
        if (mistake) recordMistake(mistake, message, shielded);
        if (r.shake) setShakeN((n) => n + 1);
        if (r.session.hearts < heartsBefore) setBreakN((n) => n + 1);
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
    setSession(createSession(gameId, hero, adaptation.powerUses));
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

  const closeBrief = (): void => {
    setBriefOpen(false);
    setStarted(true);
  };

  const shake = useStepAnimation({ ...ANIM.shake, play: shakeN > 0, trigger: shakeN, restValue: 0 });
  const shakeStyle = {
    transform: [{ translateX: shake.interpolate({ inputRange: [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1], outputRange: [0, -6, 6, -6, 6, -3, 0] }) }],
  };

  // ASK NOVA WHY sits under the bubble (outside its live region) for the latest mistake.
  const chipVisible = latest !== null && bubble.v === latest.bubbleV && askExpired !== latest.seq;
  const h = HEROES[hero];
  const failed = session.status === 'failed';
  const finished = failed || won !== null;

  const bubbleView = (
    <View style={styles.sayRow}>
      <SpeechBubble text={bubble.text} mood={bubble.mood} version={bubble.v} style={styles.bubble} />
      {latest && latest.mistake.explain !== false ? (
        <View style={styles.ask}>
          <AskNovaWhy key={`${run}-${latest.index}`} mistake={latest.mistake} chipVisible={chipVisible} onExplained={onExplained} />
        </View>
      ) : null}
    </View>
  );
  const goalView = (
    <View testID="game-goal-strip" style={[styles.goalStrip, narrow ? null : styles.goalBeside]}>
      <PixelText testID="game-goal" size={fontSize.small} color={colors.ac} bold>{def.goal}</PixelText>
    </View>
  );
  const novaView = (
    <View testID="game-nova" style={[styles.nova, narrow ? null : styles.novaBeside]}>
      <Sprite id={hero} scale={2} animate="bob" accessibilityLabel={`Hero ${h.name}`} />
      {bubbleView}
    </View>
  );

  return (
    <Page testID="game-screen" scroll={false} style={styles.page}>
      <View style={styles.hud}>
        <View style={styles.titles}>
          {narrow ? null : <PixelText size={fontSize.tiny} color={colors.ac} numberOfLines={1}>{GAME.tagLine(moduleNumber(m.id), m.title)}</PixelText>}
          <PixelText testID="game-title" size={narrow ? fontSize.small : fontSize.h3} color={colors.white} bold accessibilityRole="header">{def.title}</PixelText>
        </View>
        <View testID="hearts" accessible accessibilityRole="image" accessibilityLabel={heartsLabel(session)} style={styles.hearts}>
          {Array.from({ length: START_HEARTS }, (_, i) => (
            <Icon key={i} name={i < session.hearts ? 'heart' : 'heart0'} scale={2} />
          ))}
          {session.shield ? (
            <View testID="shield-indicator" style={styles.shield}>
              <Icon name="shield" scale={2} />
            </View>
          ) : null}
        </View>
        <PixelButton
          testID="power-button"
          label={h.powerName}
          icon={POWER_ICON[h.power]}
          iconOnly={narrow}
          variant="secondary"
          disabled={!canUsePower(session) || !file}
          accessibilityLabel={powerLabel(session)}
          accessibilityHint={GAME.heroAlt}
          onPress={pressPower}
          style={styles.hudButton}
        >
          <PixelText size={fontSize.tiny} color={colors.ac}>{`x${session.powerUses}`}</PixelText>
        </PixelButton>
        <PixelButton testID="brief-open" variant="secondary" label={side ? GAME.howTo : '?'} accessibilityLabel={GAME.helpLabel} onPress={() => setBriefOpen(true)} style={styles.hudButton} />
      </View>

      {/* The mission and the hero's speech share one row, so the activity gets the full width. */}
      {narrow ? (
        <>
          {goalView}
          {finished ? null : novaView}
        </>
      ) : (
        <View style={styles.infoRow}>
          {goalView}
          {novaView}
        </View>
      )}

      <View style={styles.main}>
        <Animated.View testID="game-body" style={[styles.body, shakeStyle]}>
          <ScrollView style={styles.fill} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            {failed ? (
              <FailView onRetry={restart} mistakes={mistakes} explanations={explanations} />
            ) : won ? (
              <WinView gameId={gameId} mod={mod} win={won} onReplay={replay} mistakes={mistakes} explanations={explanations} />
            ) : !file ? (
              <CaseFileLoading first={caseFile.state.status === 'loading' && caseFile.state.first} />
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
          </ScrollView>
        </Animated.View>
      </View>

      <HeartBreak count={breakN} />
      {briefOpen ? <MissionBrief def={def} hero={h} playerName={playerName} adaptation={adaptation} resuming={started} onClose={closeBrief} /> : null}
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
      <Icon name="heart0" scale={5} />
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
      <View style={styles.winTop}>
        <Bob>
          <Icon name="trophy" scale={4} />
        </Bob>
        <View testID="win-stars" accessible accessibilityRole="image" accessibilityLabel={GAME.stars(stars)} style={styles.stars}>
          {[0, 1, 2].map((i) => (
            <Icon key={i} name={i < stars ? 'star' : 'star0'} scale={3} />
          ))}
        </View>
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
  page: { paddingTop: 4, paddingBottom: 4, paddingHorizontal: 6, gap: 4 },
  fill: { flex: 1, minHeight: 0 },
  hud: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, paddingHorizontal: 6, backgroundColor: colors.cd, borderBottomWidth: border.width, borderBottomColor: colors.ln },
  titles: { flex: 1, minWidth: 0 },
  hudButton: { paddingVertical: 4, paddingHorizontal: 8, minHeight: 40, minWidth: 40 },
  hearts: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  shield: { marginLeft: 4 },
  goalStrip: { justifyContent: 'center', paddingVertical: 2, paddingHorizontal: 6, backgroundColor: colors.deep, borderLeftWidth: border.width, borderLeftColor: colors.ac },
  goalBeside: { flex: 1, minWidth: 0 },
  infoRow: { flexDirection: 'row', gap: 4 },
  // Clipped so the bubble's pop animation never pokes past a phone's edge.
  nova: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 2, backgroundColor: colors.cd, overflow: 'hidden' },
  novaBeside: { flex: 1.3, minWidth: 0 },
  main: { flex: 1, minHeight: 0, gap: 4 },
  sayRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  ask: { alignSelf: 'center' },
  bubble: { flex: 1, minWidth: 0, minHeight: 34, paddingVertical: 2 },
  body: { flex: 1, minHeight: 0, minWidth: 0 },
  bodyContent: { flexGrow: 1 },
  play: { flexGrow: 1, gap: 6 },
  res: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln },
  center: { textAlign: 'center' },
  winTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stars: { flexDirection: 'row', gap: 6 },
  reveal: { alignSelf: 'stretch', backgroundColor: colors.deep, borderWidth: border.thin, borderColor: colors.ac, padding: 8, gap: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
});
