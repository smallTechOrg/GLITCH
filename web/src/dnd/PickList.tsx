// <PickList …/> — tap-the-line games (Fact or Fib, Proxy Hunt) on NOVA's "paper"
// (v3 lines 512–519, 550–557). Lines are Pressable buttons (keyboard: Tab + Enter/Space).
// Registers X-RAY (catch next target) and FOCUS (mark next non-target safe) with the frame.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { GameApi } from '../contracts/game';
import { announce } from '../a11y/announce';
import { border, colors, fontSize, shadows } from '../theme/tokens';
import { PixelText } from '../ui/PixelText';
import { useFocusRing } from '../ui/focus';
import { PICK_DONE_DELAY_MS, createPick, focus, isComplete, tap, targetCount, xray, type PickLine, type PickMark, type PickState } from './pickEngine';

export interface PickListProps {
  lines: readonly PickLine[];
  api: GameApi;
  /** Paper heading, e.g. "NOVA · DRAFT ESSAY". */
  paperTag: string;
  /** Counter prefix, e.g. "FIBS FOUND" → "FIBS FOUND: n/3" (testID pick-found). */
  counterLabel: string;
  targetTag: string; // 'FIB' | 'PROXY'
  safeTag: string; // 'TRUE' | 'OK'
  /** Bubble line when a target is caught (tap or X-RAY), e.g. l => `Fib caught! ${l.note}`. */
  foundLine: (line: PickLine, index: number) => string;
  /** miss() message when a non-target is tapped. */
  missMessage: string;
  /** FOCUS bubble line. */
  focusLine: string;
  /** Show the note on safe lines too (Proxy Hunt "OK" + note). */
  showSafeNote?: boolean;
  /** Fires `doneDelayMs` (default 700) after the last target is found. */
  onDone: () => void;
  doneDelayMs?: number;
  onChange?: (s: PickState) => void;
}

export const REDACTED = '▮▮▮▮▮▮ REMOVED';

export function PickList({
  lines, api, paperTag, counterLabel, targetTag, safeTag, foundLine, missMessage, focusLine,
  showSafeNote = false, onDone, doneDelayMs = PICK_DONE_DELAY_MS, onChange,
}: PickListProps): React.JSX.Element {
  const [state, setState] = useState<PickState>(() => createPick(lines));
  const sref = useRef(state);
  const apiRef = useRef(api);
  apiRef.current = api;
  const cbs = useRef({ onDone, onChange, foundLine });
  cbs.current = { onDone, onChange, foundLine };
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  const commit = useCallback((s: PickState) => {
    sref.current = s;
    setState(s);
    cbs.current.onChange?.(s);
  }, []);

  const found = useCallback(
    (s: PickState, i: number) => {
      commit(s);
      const l = s.lines[i];
      if (l) apiRef.current.say(cbs.current.foundLine(l, i), 'good');
      if (isComplete(s) && !doneTimer.current) doneTimer.current = setTimeout(() => cbs.current.onDone(), doneDelayMs);
    },
    [commit, doneDelayMs],
  );

  const onTap = useCallback(
    (i: number) => {
      if (apiRef.current.over) return;
      const r = tap(sref.current, i);
      if (r.result === 'found') found(r.state, i);
      else if (r.result === 'safe') {
        commit(r.state);
        apiRef.current.miss(missMessage);
      }
    },
    [commit, found, missMessage],
  );

  useEffect(() => {
    api.registerPowers({
      scan: () => {
        const r = xray(sref.current);
        if (r.index === null) return false;
        found(r.state, r.index);
        return true;
      },
      hint: () => {
        const r = focus(sref.current);
        if (r.index === null) return false;
        commit(r.state);
        apiRef.current.say(focusLine, 'good');
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = targetCount(state);
  return (
    <View>
      <View style={styles.paper}>
        <PixelText size={fontSize.tiny} color={colors.paperTag} style={styles.ptag}>{paperTag}</PixelText>
        {state.lines.map((l, i) =>
          l.isTarget === null ? (
            <View key={i} testID={`pick-line-${i}`} accessible accessibilityLabel={`${i + 1}. ${l.label ?? l.text}: removed`} style={[styles.line, styles.hid]}>
              <PixelText size={fontSize.small} color={colors.redactedText}>{String(i + 1)}</PixelText>
              <PixelText long size={fontSize.small} color={colors.redactedText} style={styles.text}>{`${l.label ?? l.text}: ${REDACTED}`}</PixelText>
            </View>
          ) : (
            <Line key={i} index={i} line={l} mark={state.marks[i]} targetTag={targetTag} safeTag={safeTag} showSafeNote={showSafeNote} disabled={api.over} onPress={onTap} />
          ),
        )}
      </View>
      <PixelText testID="pick-found" size={fontSize.ui} color={colors.ac} style={styles.found} accessibilityLiveRegion="polite">
        {`${counterLabel}: ${state.found}/${total}`}
      </PixelText>
    </View>
  );
}

interface LineProps {
  index: number;
  line: PickLine;
  mark: PickMark | undefined;
  targetTag: string;
  safeTag: string;
  showSafeNote: boolean;
  disabled: boolean;
  onPress(i: number): void;
}

function Line({ index, line, mark, targetTag, safeTag, showSafeNote, disabled, onPress }: LineProps): React.JSX.Element {
  const f = useFocusRing();
  const marked = mark !== undefined;
  const tag = mark === 'target' ? targetTag : mark === 'safe' ? safeTag : '';
  const note = mark === 'target' || (mark === 'safe' && showSafeNote) ? line.note : undefined;
  useEffect(() => {
    if (mark) announce(`${tag}${note ? `. ${note}` : ''}`);
  }, [mark, tag, note]);
  return (
    <Pressable
      testID={`pick-line-${index}`}
      onPress={() => onPress(index)}
      disabled={disabled || marked}
      onFocus={f.onFocus}
      onBlur={f.onBlur}
      accessibilityRole="button"
      accessibilityLabel={`${index + 1}. ${line.text}${marked ? `, ${tag}` : ''}`}
      accessibilityState={{ disabled: disabled || marked }}
      aria-disabled={disabled || marked}
      style={[styles.line, mark === 'target' ? styles.target : mark === 'safe' ? styles.safe : null, f.ring]}
    >
      <PixelText size={fontSize.small} color={colors.paperNum}>{String(index + 1)}</PixelText>
      <PixelText long size={fontSize.small} color={colors.ink} style={styles.text}>{line.text}</PixelText>
      {marked ? (
        <View style={styles.result}>
          <View style={[styles.tg, { backgroundColor: mark === 'target' ? colors.no : colors.okDark }]}>
            <PixelText size={fontSize.tiny} color={mark === 'target' ? colors.ink : colors.white}>{tag}</PixelText>
          </View>
          {note ? <PixelText long size={fontSize.tiny} color={colors.paperNote} style={styles.note}>{note}</PixelText> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.paper, borderWidth: border.width, borderColor: colors.ink, padding: 14, gap: 6, boxShadow: shadows.paper },
  ptag: { marginBottom: 6 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10, paddingVertical: 8, paddingHorizontal: 10, minHeight: 44, backgroundColor: colors.paperLine, borderWidth: border.thin, borderColor: colors.paperBorder },
  hid: { backgroundColor: colors.redacted, borderColor: colors.redactedBorder },
  text: { flex: 1, minWidth: 150 },
  target: { backgroundColor: colors.sayBad, borderColor: colors.no },
  safe: { backgroundColor: colors.sayGood, borderColor: colors.ok },
  result: { flexBasis: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tg: { paddingVertical: 2, paddingHorizontal: 6 },
  note: { flex: 1 },
  found: { marginTop: 12 },
});
