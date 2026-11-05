// m1g1 · Train the Model — render + wiring only (v3 `GM.m1g1.run`, lines 504–511).
// Step 1 sorts the training emails, step 2 judges the model's verdicts on new emails,
// then the fixed TRAINING VS TESTING comparison and "Finish ▶" → win(summary).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { Icon } from '../../art/Icon';
import { SortBoard, type SortItemRenderContext } from '../../dnd/SortBoard';
import { border, colors, fontSize, space } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import {
  FINISH_LABEL, RESULT_EXPLAIN, RESULT_HEAD, RESULT_TEST, RESULT_TRAIN, STEP1_DONE_LINE, STEP1_HEAD, STEP2_HEAD, STEP2_SUB, V3_SCENARIO, WIN_SUMMARY,
  type TrainScenario,
} from './data';
import { nextStep, testConfig, trainingConfig, type Step, type TrainItem } from './logic';

/** `scenario` defaults to the v3 case file; a replay may inject a NOVA variation of the same shape. */
export function TrainTheModel({ api, scenario = V3_SCENARIO }: { api: GameApi; scenario?: TrainScenario }): React.JSX.Element {
  const [step, setStep] = useState<Step>('train');
  const train = useMemo(() => trainingConfig(scenario), [scenario]);
  const test = useMemo(() => testConfig(scenario), [scenario]);

  useEffect(() => {
    // Result screen: nothing left for X-RAY / FOCUS (v3: the step-2 board has nothing left).
    if (step === 'result') api.registerPowers({ scan: () => false, hint: () => false });
  }, [api, step]);

  const onTrainDone = useCallback(() => {
    api.say(STEP1_DONE_LINE, 'good');
    setStep(nextStep);
  }, [api]);
  const onTestDone = useCallback(() => setStep(nextStep), []);

  if (step === 'train') {
    return <SortBoard key="train" cfg={train} api={api} onDone={onTrainDone} header={<Heading text={STEP1_HEAD} />} testID="m1g1-step-train" />;
  }
  if (step === 'test') {
    return (
      <SortBoard
        key="test"
        cfg={test}
        api={api}
        onDone={onTestDone}
        header={
          <View>
            <Heading text={STEP2_HEAD} />
            <PixelText long size={fontSize.small} color={colors.mu}>{STEP2_SUB}</PixelText>
          </View>
        }
        renderItem={renderTestItem}
        testID="m1g1-step-test"
      />
    );
  }
  return (
    <View testID="m1g1-result" style={styles.result}>
      <Heading text={RESULT_HEAD} />
      <View style={styles.cmp}>
        <ResultTile testID="m1g1-result-train" {...RESULT_TRAIN} bad={false} />
        <ResultTile testID="m1g1-result-test" {...RESULT_TEST} bad />
      </View>
      <PixelText long size={fontSize.small} color={colors.mu} style={styles.sub}>{RESULT_EXPLAIN}</PixelText>
      <PixelButton testID="m1g1-finish" variant="primary" label={FINISH_LABEL} accessibilityLabel="Finish" disabled={api.over} onPress={() => api.win(WIN_SUMMARY)} />
    </View>
  );
}

function Heading({ text }: { text: string }): React.JSX.Element {
  return (
    <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header" style={styles.ph}>
      {text}
    </PixelText>
  );
}

function renderTestItem(it: TrainItem, ctx: SortItemRenderContext): React.ReactNode {
  return (
    <View style={styles.row}>
      {ctx.compact ? null : <Icon name={it.icon ?? 'envelope'} scale={3} />}
      <View style={styles.col}>
        <PixelText long size={fontSize.small}>{it.email}</PixelText>
        <PixelText size={fontSize.tiny} color={colors.ac} style={styles.vd}>{it.says ?? ''}</PixelText>
      </View>
    </View>
  );
}

function ResultTile({ label, score, pct, bad, testID }: { label: string; score: string; pct: string; bad: boolean; testID: string }): React.JSX.Element {
  return (
    <View testID={testID} accessible accessibilityLabel={`${label}: ${score}, ${pct}`} style={[styles.tile, { borderColor: bad ? colors.no : colors.ok }]}>
      <PixelText size={fontSize.tiny} color={colors.mu}>{label}</PixelText>
      <PixelText size={fontSize.h1} color={bad ? colors.no : colors.ok} bold>{score}</PixelText>
      <PixelText size={fontSize.small}>{pct}</PixelText>
    </View>
  );
}

const styles = StyleSheet.create({
  ph: { marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  col: { flexShrink: 1, gap: 4 },
  vd: { marginTop: 2 },
  result: { gap: space.lg, alignItems: 'center' },
  cmp: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, justifyContent: 'center', alignSelf: 'stretch' },
  tile: { flexGrow: 1, flexBasis: 140, minWidth: 140, alignItems: 'center', gap: space.sm, padding: space.lg, borderWidth: border.width, backgroundColor: colors.cd },
  sub: { textAlign: 'center' },
});
