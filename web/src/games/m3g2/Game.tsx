// m3g2 · Fairness Lab — render + wiring only. Flow: audit the inputs, then answer the case's own
// ethics question. Clearing a case moves the next play on to a different one. Maths/audit/powers
// live in logic.ts; copy and cases in data.ts.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { shuffled } from '../../engine/shuffle';
import { clearFairnessCase } from '../../state/actions';
import { useGlitchStore } from '../../state/store';
import { border, colors, fontSize, layout, space } from '../../theme/tokens';
import { MetricBar } from '../../ui/MetricBar';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { ToggleTile } from '../../ui/ToggleTile';
import {
  ACCURACY_GOAL, ACCURACY_LABEL, AUDIT_A11Y_LABEL, AUDIT_LABEL, BAR_PX_PER_PCT, DECISION_HEAD, DECISION_RIGHT, DECISION_WRONG, FLASH_MS, GAP_GOAL, GAP_LABEL,
  MEN_SHORTLISTED, WIN_DELAY_MS, caseFor, focusLine, focusSkillLine, xrayLine, type DecisionOption, type FairnessCase,
} from './data';
import { audit, auditMistake, calc, decisionMistake, focusTarget, groupBShare, initialOn, toggle, xrayFix, type OnMap } from './logic';

export function FairnessLabGame({ api }: { api: GameApi }): React.JSX.Element {
  const [c] = useState<FairnessCase>(() => caseFor(useGlitchStore.getState().fairnessCases));
  // Inputs and answers in a fresh order each play, so skills don't always come first.
  const [features] = useState(() => shuffled(c.features));
  const [options] = useState(() => shuffled(c.options));
  const [on, setOn] = useState<OnMap>(() => initialOn(features));
  const [flash, setFlash] = useState<string | null>(null);
  const [stage, setStage] = useState<'audit' | 'decide'>('audit');
  const [done, setDone] = useState(false);
  const [wrongPicks, setWrongPicks] = useState<readonly string[]>([]);
  const onRef = useRef(on);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const doneRef = useRef(false);
  const apiRef = useRef(api);
  apiRef.current = api;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { width } = useWindowDimensions();
  const wide = width >= layout.sideBySide;
  const narrow = width <= layout.mobileBreakpoint;

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const commit = useCallback((next: OnMap) => {
    onRef.current = next;
    setOn(next);
  }, []);

  const onToggle = useCallback(
    (id: string) => {
      if (apiRef.current.over || stageRef.current !== 'audit') return;
      commit(toggle(onRef.current, id));
    },
    [commit],
  );

  const onAudit = useCallback(() => {
    if (apiRef.current.over || stageRef.current !== 'audit') return;
    const r = audit(onRef.current, features);
    if (r.pass) {
      apiRef.current.say(r.message, 'good');
      setStage('decide');
    } else apiRef.current.miss(r.message, auditMistake(onRef.current, c));
  }, [c]);

  const onDecide = (o: DecisionOption): void => {
    if (apiRef.current.over || doneRef.current) return;
    if (!o.right) {
      setWrongPicks((w) => [...w, o.id]);
      apiRef.current.miss(DECISION_WRONG, decisionMistake(c, o));
      return;
    }
    doneRef.current = true;
    setDone(true);
    apiRef.current.say(DECISION_RIGHT, 'good');
    timers.current.push(
      setTimeout(() => {
        clearFairnessCase();
        apiRef.current.win(c.summary);
      }, WIN_DELAY_MS),
    );
  };

  useEffect(() => {
    api.registerPowers({
      scan: () => {
        if (stageRef.current === 'decide') {
          const right = options.find((o) => o.right);
          if (!right || doneRef.current) return false;
          setFlash(right.id);
          apiRef.current.say(`X-RAY: "${right.text}"`, 'good');
          return true;
        }
        const r = xrayFix(onRef.current, features);
        if (!r) return false;
        commit(r.on);
        apiRef.current.say(xrayLine(r.name), 'good');
        return true;
      },
      hint: () => {
        if (stageRef.current === 'decide') {
          const wrong = options.find((o) => !o.right);
          if (!wrong || doneRef.current) return false;
          setWrongPicks((w) => (w.includes(wrong.id) ? w : [...w, wrong.id]));
          apiRef.current.say(`FOCUS: not "${wrong.text}"`, 'good');
          return true;
        }
        const t = focusTarget(onRef.current, features);
        if (!t) return false;
        setFlash(t.id);
        timers.current.push(setTimeout(() => setFlash((f) => (f === t.id ? null : f)), FLASH_MS));
        apiRef.current.say(t.kind === 'p' ? focusLine(t.name, c.standsInFor) : focusSkillLine(t.name), 'good');
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === 'decide') {
    return (
      <View testID="m3g2-decide" style={styles.root}>
        <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">{DECISION_HEAD(c.concern)}</PixelText>
        <PixelText testID="m3g2-question" long size={fontSize.body}>{c.question}</PixelText>
        <View style={styles.options}>
          {options.map((o) => (
            <PixelButton
              key={o.id}
              testID={`m3g2-option-${o.id}`}
              label={o.text}
              color={flash === o.id ? colors.ac : undefined}
              disabled={api.over || done || wrongPicks.includes(o.id)}
              onPress={() => onDecide(o)}
              fullWidth
            />
          ))}
        </View>
      </View>
    );
  }

  const m = calc(on, features);
  const groupB = groupBShare(m);
  const disabled = api.over;

  return (
    <View testID={`m3g2-case-${c.id}`} style={styles.root}>
      <PixelText testID="m3g2-heading" size={fontSize.h3} color={colors.ac} accessibilityRole="header">{c.heading}</PixelText>
      <PixelText testID="m3g2-rule" long size={fontSize.small} color={colors.mu}>{c.rule}</PixelText>
      <View style={[styles.columns, wide ? styles.columnsWide : null]}>
        <View style={[styles.toggles, wide ? styles.column : null]}>
          {/* One icon for every input: a skill/proxy icon would give the answer away. */}
          {features.map(([id, name]) => (
            <ToggleTile
              key={id}
              id={id}
              label={name}
              on={!!on[id]}
              icon="doc"
              flash={flash === id}
              disabled={disabled}
              onToggle={() => onToggle(id)}
              style={wide ? styles.toggleWide : styles.toggle}
            />
          ))}
        </View>
        <View style={[styles.results, wide ? styles.column : null]}>
          <View style={styles.chart}>
            <GroupBar testID="m3g2-group-a" label={c.groupA} pct={MEN_SHORTLISTED} color={colors.bl} showBar={!narrow} />
            <GroupBar testID="m3g2-group-b" label={c.groupB} pct={groupB} color={colors.pk} showBar={!narrow} />
          </View>
          <MetricBar id="gap" label={GAP_LABEL} value={m.gap} target={GAP_GOAL} direction={-1} icon="scales" />
          <MetricBar id="accuracy" label={ACCURACY_LABEL} value={m.accuracy} target={ACCURACY_GOAL} direction={1} icon="target" />
          <PixelButton testID="m3g2-audit" label={AUDIT_LABEL} variant="primary" onPress={onAudit} disabled={disabled} accessibilityLabel={AUDIT_A11Y_LABEL} fullWidth />
        </View>
      </View>
    </View>
  );
}

function GroupBar({ testID, label, pct, color, showBar }: { testID: string; label: string; pct: number; color: string; showBar: boolean }): React.JSX.Element {
  return (
    <View testID={testID} accessible accessibilityLabel={`${label} ${pct}%`} style={styles.col}>
      {showBar ? (
        <View style={styles.track}>
          <View style={[styles.fill, { height: Math.max(0, pct) * BAR_PX_PER_PCT, backgroundColor: color }]} />
        </View>
      ) : null}
      <PixelText size={fontSize.ui} color={color} bold>{`${pct}%`}</PixelText>
      <PixelText size={fontSize.tiny} color={colors.mu} style={styles.colLabel}>{label}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  options: { gap: space.sm, marginTop: space.sm },
  columns: { gap: space.sm },
  columnsWide: { flexDirection: 'row' },
  column: { flex: 1, minWidth: 0 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  toggle: { flexGrow: 1, flexBasis: '47%' },
  toggleWide: { flexBasis: '100%' },
  results: { gap: space.xs },
  chart: { flexDirection: 'row', justifyContent: 'center', columnGap: space.lg },
  // Columns shrink (labels wrap) so the chart fits a 320 px screen.
  col: { flex: 1, alignItems: 'center', minWidth: 0 },
  colLabel: { textAlign: 'center' },
  track: { width: 48, height: MEN_SHORTLISTED * BAR_PX_PER_PCT, justifyContent: 'flex-end', borderBottomWidth: border.thin, borderColor: colors.ln },
  fill: { width: '100%' },
});
