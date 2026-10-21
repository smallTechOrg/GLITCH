// m1g2 · Fact or Fib — render + wiring only (v3 `GM.m1g2.run`, lines 512–519).
import React, { useCallback, useMemo } from 'react';
import type { GameApi } from '../../contracts/game';
import { PickList } from '../../dnd/PickList';
import {
  COUNTER_LABEL, FIB_TAG, FOCUS_LINE, PAPER_TAG, TRUE_MISS, TRUE_TAG, V3_SCENARIO, WIN_DELAY_MS, WIN_SUMMARY, type FibScenario,
} from './data';
import { foundLine, pickLines, trueLineMistake } from './logic';

/** `scenario` defaults to the v3 case file; a replay may inject a NOVA variation of the same shape. */
export function FactOrFib({ api, scenario = V3_SCENARIO }: { api: GameApi; scenario?: FibScenario }): React.JSX.Element {
  const lines = useMemo(() => pickLines(scenario), [scenario]);
  const onDone = useCallback(() => api.win(WIN_SUMMARY), [api]);
  return (
    <PickList
      lines={lines}
      api={api}
      paperTag={PAPER_TAG}
      counterLabel={COUNTER_LABEL}
      targetTag={FIB_TAG}
      safeTag={TRUE_TAG}
      foundLine={foundLine}
      missMessage={TRUE_MISS}
      mistakeFor={trueLineMistake}
      focusLine={FOCUS_LINE}
      onDone={onDone}
      doneDelayMs={WIN_DELAY_MS}
    />
  );
}
