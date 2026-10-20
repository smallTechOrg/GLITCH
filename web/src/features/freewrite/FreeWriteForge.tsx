// FORGE 3 · FREE WRITE (spec/capabilities/freewrite-forge.md). The learner writes a prompt for
// a goal; one server call returns NOVA's reply + 5-lever verdict + tip. Any failure (8 s
// timeout, network, server error, safety filter, caps) falls back in-world to the offline
// check. ≥ 4/5 levers → "Finish ▶" → onPassed; fewer → api.miss (frame owns hearts/shield).
// The API client is injectable for tests; FreeWriteRound wires the real one.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { CLIENT_TIMEOUT_MS, FREEWRITE_PROMPT_MAX } from '../../contracts/api';
import type { ApiClient } from '../../api/client';
import type { GameApi } from '../../contracts/game';
import { announce } from '../../a11y/announce';
import { newUuidV4 } from '../../state/deviceId';
import { useGlitchStore } from '../../state/store';
import { longTextStyle } from '../../theme/fonts';
import { border, colors, fontSize, layout } from '../../theme/tokens';
import { Card } from '../../ui/Card';
import { EnergyMeter, type EnergyState } from '../../ui/EnergyMeter';
import { useFocusRing } from '../../ui/focus';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { freeWriteMistake } from '../../games/m2g2/logic';
import { COPY, type Goal } from './data';
import { checkLevers } from './levers';
import { LeverChips } from './LeverChips';
import { bannerText, focusLine, historyEntry, offlineOutcome, outcomeFromResult, pickGoal, xrayLine, type RoundOutcome } from './logic';
import { NovaThinking } from './NovaThinking';
import { PromptLog } from './PromptLog';
import { ReplyBox } from './ReplyBox';

export type FreewriteClient = Pick<ApiClient, 'getEnergy' | 'evaluateFreewrite'>;

export interface FreeWriteForgeProps {
  api: GameApi;
  onPassed: () => void;
  client: FreewriteClient;
  /** Injected clock (recharge hours, history timestamps). */
  now?: () => Date;
  /** Injected id maker for history entries. */
  makeId?: () => string;
}

const defaultNow = (): Date => new Date();

export function FreeWriteForge({ api, onPassed, client, now = defaultNow, makeId = newUuidV4 }: FreeWriteForgeProps): React.JSX.Element {
  const addPromptHistory = useGlitchStore((s) => s.addPromptHistory);
  const readable = useGlitchStore((s) => s.settings.readableFont);
  // Goal is fixed for the round: picked once from the on-device history.
  const [goal] = useState<Goal>(() => pickGoal(useGlitchStore.getState().promptHistory));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof checkLevers> | null>(null);
  const [energy, setEnergy] = useState<EnergyState>({ kind: 'loading' });
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const inputFocus = useFocusRing();

  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
    };
  }, []);

  // Live values for power handlers (registered once per api).
  const live = useRef({ api, draft, busy, outcome, lastSent, goal });
  live.current = { api, draft, busy, outcome, lastSent, goal };

  // Opening bubble.
  useEffect(() => {
    live.current.api.say(COPY.intro);
  }, []);

  // Read energy (does not consume). Unreachable → "?" and the round stays playable.
  useEffect(() => {
    const ctrl = new AbortController();
    client.getEnergy(ctrl.signal).then((r) => {
      if (!alive.current || ctrl.signal.aborted) return;
      if (r.energy) setEnergy({ kind: 'ok', ...r.energy });
      else setEnergy({ kind: 'offline' });
    });
    return () => ctrl.abort();
  }, [client]);

  const passed = !!outcome?.passed;

  // Hero powers for this round (uses are shared with forges 1–2 — the frame counts them).
  useEffect(() => {
    api.registerPowers({
      scan: () => {
        const s = live.current;
        if (s.busy || s.outcome?.passed || s.api.over) return false;
        const d = s.draft.trim();
        if (!d) return false; // not consumed on an empty draft
        const levers = checkLevers(d);
        setPreview(levers);
        s.api.say(xrayLine(levers), 'good');
        return true;
      },
      hint: () => {
        const s = live.current;
        if (s.outcome?.passed || s.api.over) return false;
        s.api.say(focusLine(s.goal, s.draft), 'good');
        return true; // always consumed
      },
      undo: () => {
        const s = live.current;
        if (!s.draft.trim() && s.lastSent) setDraft(s.lastSent);
      },
    });
  }, [api]);

  const flat = energy.kind === 'ok' && energy.remaining <= 0;
  const locked = busy || passed || api.over;
  const canSend = !locked && draft.trim().length > 0;

  const settle = useCallback(
    (o: RoundOutcome, prompt: string) => {
      if (o.energy) setEnergy({ kind: 'ok', ...o.energy });
      else if (o.fallback === 'flat') setEnergy((e) => (e.kind === 'ok' ? { ...e, remaining: 0 } : e));
      addPromptHistory(historyEntry(makeId(), goal, prompt, o, now()));
      setOutcome(o);
      announce(`${o.leversHit} of 5 levers`);
      if (o.passed) api.say(COPY.passed, 'good');
      else api.miss(COPY.weak, freeWriteMistake(goal, o.leversHit));
    },
    [addPromptHistory, api, goal, makeId, now],
  );

  const send = useCallback(async () => {
    const prompt = draft.trim();
    if (!prompt || busy || passed || api.over) return;
    setPreview(null);
    setOutcome(null);
    setLastSent(prompt);
    if (flat) {
      // Battery flat: offline check, no server call.
      settle(offlineOutcome(goal, prompt, 'flat'), prompt);
      return;
    }
    setBusy(true);
    const ctrl = new AbortController();
    pending.current = ctrl;
    const r = await client.evaluateFreewrite({ goalId: goal.id, goal: goal.goal, prompt }, { timeoutMs: CLIENT_TIMEOUT_MS, signal: ctrl.signal });
    pending.current = null;
    if (!alive.current) return;
    setBusy(false);
    settle(outcomeFromResult(goal, prompt, r), prompt);
  }, [api, busy, client, draft, flat, goal, passed, settle]);

  const finish = useCallback(() => {
    if (finished || !passed) return;
    setFinished(true);
    onPassed();
  }, [finished, onPassed, passed]);

  const banner = outcome?.fallback
    ? bannerText(outcome.fallback, energy.kind === 'ok' ? energy.resetsAt : undefined, now())
    : flat
      ? bannerText('flat', energy.kind === 'ok' ? energy.resetsAt : undefined, now())
      : null;

  const sendLabel = flat ? COPY.sendOffline : outcome && !outcome.passed ? COPY.resend : COPY.send;

  return (
    <View testID="fw-root" style={styles.wrap}>
      <PixelText size={fontSize.h3} color={colors.ac} accessibilityRole="header">{COPY.header}</PixelText>
      <PixelText long size={fontSize.small} color={colors.mu}>{COPY.sub}</PixelText>

      <Card accent={colors.ac} style={styles.goalCard}>
        <PixelText testID="fw-goal" long color={colors.tx}>{`${COPY.goalLabel} ${goal.goal}`}</PixelText>
      </Card>

      <EnergyMeter state={energy} now={now()} testID="fw-energy" />

      {banner ? (
        <View testID="fw-offline-banner" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.banner}>
          <PixelText size={fontSize.small} color={colors.ink}>{banner}</PixelText>
        </View>
      ) : null}

      <View style={styles.editor}>
        <PixelText size={fontSize.tiny} color={colors.mu} nativeID="fw-input-label">{COPY.inputLabel}</PixelText>
        <TextInput
          testID="fw-input"
          accessibilityLabel={COPY.inputLabel}
          aria-labelledby="fw-input-label"
          placeholder={COPY.placeholder}
          placeholderTextColor={colors.mu}
          value={draft}
          onChangeText={(t) => {
            setDraft(t.slice(0, FREEWRITE_PROMPT_MAX));
            setPreview(null);
          }}
          maxLength={FREEWRITE_PROMPT_MAX}
          multiline
          editable={!locked}
          aria-disabled={locked}
          onFocus={inputFocus.onFocus}
          onBlur={inputFocus.onBlur}
          style={[styles.input, longTextStyle(readable, fontSize.body), locked ? styles.inputLocked : null, inputFocus.ring]}
        />
        <PixelText testID="fw-count" size={fontSize.tiny} color={draft.length >= FREEWRITE_PROMPT_MAX ? colors.no : colors.mu} style={styles.count}>
          {`${draft.length}/${FREEWRITE_PROMPT_MAX}`}
        </PixelText>
        {preview ? <LeverChips levers={preview} preview /> : null}
        {passed ? null : (
          <PixelButton testID="fw-send" label={sendLabel} variant="primary" disabled={!canSend} onPress={() => void send()} />
        )}
      </View>

      {busy ? <NovaThinking reducedMotion={api.reducedMotion} /> : null}

      {outcome ? (
        <View testID="fw-result" style={styles.result}>
          <ReplyBox label={outcome.replyLabel} reply={outcome.reply} demo={outcome.demo} />
          <LeverChips levers={outcome.levers} />
          <PixelText testID="fw-score" size={fontSize.h3} color={outcome.passed ? colors.ok : colors.no}>{`${outcome.leversHit}/5 LEVERS`}</PixelText>
          <View testID="fw-tip" style={styles.tip}>
            <PixelText size={fontSize.tiny} color={colors.ac}>{COPY.tipLabel}</PixelText>
            <PixelText long>{outcome.tip}</PixelText>
          </View>
          {outcome.passed ? <PixelButton testID="fw-finish" label={COPY.finish} variant="primary" disabled={finished} onPress={finish} /> : null}
        </View>
      ) : null}

      <PromptLog />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  goalCard: { padding: 14 },
  banner: { backgroundColor: colors.ac, borderWidth: border.width, borderColor: colors.ink, padding: 10 },
  editor: { gap: 6 },
  input: {
    color: colors.tx,
    backgroundColor: colors.deep,
    borderWidth: border.width,
    borderColor: colors.ln,
    padding: 10,
    minHeight: 120,
    minWidth: layout.minTouch,
    textAlignVertical: 'top',
  },
  inputLocked: { opacity: 0.6 },
  count: { alignSelf: 'flex-end' },
  result: { gap: 6 },
  tip: { borderWidth: border.thin, borderColor: colors.ac, padding: 10, gap: 4 },
});
