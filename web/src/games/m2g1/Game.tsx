// m2g1 · Tune the Sorter — render + wiring only (v3 `tuneRound` / `GM.m2g1`, lines 521–540).
// Two rounds; sliders reset to (50, 30) each round; LOCK IT IN passes → next round / win.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { border, colors, fontSize, layout } from '../../theme/tokens';
import { Bar } from '../../ui/Bar';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { Slider } from '../../ui/Slider';
import {
  CAPS_WEIGHT, LOCK_LABEL, NEXT_DELAY_MS, ROUNDS, ROUND_CLEAR_LINE, ROW_MISMATCH_TAG, THRESHOLD, WIN_SUMMARY, XRAY_LINE,
  type TuneRoundConfig,
} from './data';
import { evaluate, focusLine, lockIn, rowLabel } from './logic';

export function TuneTheSorterGame({ api }: { api: GameApi }): React.JSX.Element {
  const [round, setRound] = useState(0);
  const [t, setT] = useState<number>(THRESHOLD.start);
  const [wC, setWC] = useState<number>(CAPS_WEIGHT.start);
  const [clearing, setClearing] = useState(false);
  const live = useRef({ round, t, wC, clearing });
  live.current = { round, t, wC, clearing };
  const apiRef = useRef(api);
  apiRef.current = api;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();
  const narrow = width <= layout.mobileBreakpoint;

  const cfg = ROUNDS[round] as TuneRoundConfig;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const setSliders = useCallback((nt: number, nw: number) => {
    if (apiRef.current.over) return;
    live.current = { ...live.current, t: nt, wC: nw };
    setT(nt);
    setWC(nw);
  }, []);

  // Powers for the current round (v3 tuneRound's scan/hint — both always consumed).
  useEffect(() => {
    const rc = ROUNDS[round] as TuneRoundConfig;
    api.registerPowers({
      scan: () => {
        setSliders(rc.sol[0], rc.sol[1]);
        apiRef.current.say(XRAY_LINE, 'good');
        return true;
      },
      hint: () => {
        apiRef.current.say(focusLine(rc, live.current.t, live.current.wC), 'good');
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const onLock = (): void => {
    const a = apiRef.current;
    if (a.over || live.current.clearing) return;
    const r = lockIn(cfg, live.current.t, live.current.wC);
    if (!r.pass) {
      a.miss(r.message);
      return;
    }
    a.say(ROUND_CLEAR_LINE, 'good');
    live.current = { ...live.current, clearing: true };
    setClearing(true);
    const last = live.current.round >= ROUNDS.length - 1;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (last) {
        apiRef.current.win(WIN_SUMMARY);
        return;
      }
      setRound((x) => x + 1);
      setSliders(THRESHOLD.start, CAPS_WEIGHT.start);
      live.current = { ...live.current, round: live.current.round + 1, clearing: false };
      setClearing(false);
    }, NEXT_DELAY_MS);
  };

  const v = evaluate(cfg, t, wC);
  const disabled = api.over || clearing;

  return (
    <View testID={`m2g1-round-${cfg.id}`} style={styles.wrap}>
      <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header" testID="m2g1-round-title">{cfg.title}</PixelText>
      <PixelText long size={fontSize.small} color={colors.mu} style={styles.rule}>{cfg.rule}</PixelText>

      <View testID="m2g1-list" style={styles.list}>
        {v.rows.map((r, i) => (
          <View
            key={r.text}
            testID={`m2g1-row-${i}`}
            accessible
            accessibilityLabel={rowLabel(cfg, r, ROW_MISMATCH_TAG)}
            style={[styles.row, r.ok ? null : styles.rowBad]}
          >
            <PixelText long size={fontSize.small} style={styles.rowText}>{r.text}</PixelText>
            {narrow ? null : <Bar value={r.score / 100} marker={t / 100} color={r.flagged ? colors.ac : colors.bl} style={styles.rowBar} />}
            <View style={styles.verdict}>
              <PixelText size={fontSize.tiny} color={r.flagged ? colors.ac : colors.mu} bold={r.flagged} testID={`m2g1-verdict-${i}`}>
                {r.flagged ? cfg.yes : cfg.no}
              </PixelText>
              {r.ok ? null : <PixelText size={fontSize.tiny} color={colors.no}>{` ✗ ${ROW_MISMATCH_TAG}`}</PixelText>}
            </View>
          </View>
        ))}
      </View>

      <Slider id={THRESHOLD.id} label={THRESHOLD.label} value={t} min={THRESHOLD.min} max={THRESHOLD.max} disabled={disabled} onChange={(n) => setSliders(n, live.current.wC)} />
      <Slider id={CAPS_WEIGHT.id} label={CAPS_WEIGHT.label} value={wC} min={CAPS_WEIGHT.min} max={CAPS_WEIGHT.max} disabled={disabled} onChange={(n) => setSliders(live.current.t, n)} />

      <View style={styles.summary}>
        <CountMetric id="a" label={cfg.ma} value={v.a} goal={cfg.ga} ok={v.aOk} />
        <CountMetric id="b" label={cfg.mbl} value={v.b} goal={cfg.gb} ok={v.bOk} />
      </View>

      <PixelButton label={LOCK_LABEL} variant="primary" testID="m2g1-lock" disabled={disabled} onPress={onLock} fullWidth />
    </View>
  );
}

/** v3 `.mt` count box: label, value, "goal ≤g"; OK/NO text so colour is never the only signal. */
function CountMetric({ id, label, value, goal, ok }: { id: string; label: string; value: number; goal: number; ok: boolean }): React.JSX.Element {
  return (
    <View testID={`metric-${id}`} accessible accessibilityLabel={`${label} ${value}, goal at most ${goal}, ${ok ? 'met' : 'not met'}`} style={[styles.metric, ok ? styles.metricOk : null]}>
      <PixelText size={fontSize.small} bold>{label}</PixelText>
      <View style={styles.metricRow}>
        <PixelText size={fontSize.body} testID={`metric-${id}-value`}>{String(value)}</PixelText>
        <PixelText size={fontSize.tiny} color={colors.mu}>{` goal ≤${goal}`}</PixelText>
        <PixelText size={fontSize.tiny} color={ok ? colors.ok : colors.no}>{ok ? ' OK' : ' NO'}</PixelText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  rule: { marginBottom: 6 },
  list: { gap: 6, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: colors.cd, borderWidth: border.thin, borderColor: colors.ln },
  rowBad: { borderColor: colors.no },
  rowText: { flex: 2, flexShrink: 1 },
  rowBar: { flex: 1.4 },
  verdict: { minWidth: 92, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  metric: { flexGrow: 1, flexBasis: 200, padding: 10, backgroundColor: colors.cd, borderWidth: border.thin, borderColor: colors.ln, gap: 4 },
  metricOk: { borderColor: colors.ok },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
});
