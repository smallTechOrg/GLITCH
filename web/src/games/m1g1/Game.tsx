// m1g1 · Train the Model — one activity across two rounds: call each email, verify beside it.
// Round 1's labels train the model; round 2's new emails also reveal how the model did. Then the
// fixed TRAINING VS TESTING comparison and "Finish ▶" → win(summary).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { shuffled } from '../../engine/shuffle';
import { border, colors, fontSize, space } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import {
  FINISH_LABEL, RESULT_EXPLAIN, RESULT_HEAD, RESULT_TEST, RESULT_TRAIN, ROUND1_DONE_LINE, ROUND1_HEAD, ROUND2_HEAD, V3_SCENARIO, WIN_SUMMARY,
  type TrainScenario,
} from './data';
import { nextStep, testRows, trainRows, type Step } from './logic';
import { PredictBoard } from './PredictBoard';

/** `scenario` defaults to the v3 case file; a replay may inject a NOVA variation of the same shape. */
export function TrainTheModel({ api, scenario = V3_SCENARIO }: { api: GameApi; scenario?: TrainScenario }): React.JSX.Element {
  const [step, setStep] = useState<Step>('train');
  // A fresh order each play, so spam and not-spam don't simply alternate.
  const train = useMemo(() => shuffled(trainRows(scenario)), [scenario]);
  const test = useMemo(() => shuffled(testRows(scenario)), [scenario]);

  useEffect(() => {
    if (step === 'result') api.registerPowers({ scan: () => false, hint: () => false });
  }, [api, step]);

  const onTrainDone = useCallback(() => {
    api.say(ROUND1_DONE_LINE, 'good');
    setStep(nextStep);
  }, [api]);
  const onTestDone = useCallback(() => setStep(nextStep), []);

  if (step === 'train') {
    return <PredictBoard key="train" step="train" heading={ROUND1_HEAD} rows={train} api={api} onNext={onTrainDone} testID="m1g1-step-train" />;
  }
  if (step === 'test') {
    return <PredictBoard key="test" step="test" heading={ROUND2_HEAD} rows={test} api={api} onNext={onTestDone} testID="m1g1-step-test" />;
  }
  return (
    <View testID="m1g1-result" style={styles.result}>
      <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">{RESULT_HEAD}</PixelText>
      <View style={styles.cmp}>
        <ResultTile testID="m1g1-result-train" {...RESULT_TRAIN} bad={false} />
        <ResultTile testID="m1g1-result-test" {...RESULT_TEST} bad />
      </View>
      <PixelText long size={fontSize.small} color={colors.mu} style={styles.sub}>{RESULT_EXPLAIN}</PixelText>
      <PixelButton testID="m1g1-finish" variant="primary" label={FINISH_LABEL} accessibilityLabel="Finish" disabled={api.over} onPress={() => api.win(WIN_SUMMARY)} />
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
  result: { gap: space.lg, alignItems: 'center' },
  cmp: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, justifyContent: 'center', alignSelf: 'stretch' },
  tile: { flexGrow: 1, flexBasis: 140, minWidth: 140, alignItems: 'center', gap: space.sm, padding: space.md, borderWidth: border.width, backgroundColor: colors.cd },
  sub: { textAlign: 'center' },
});
