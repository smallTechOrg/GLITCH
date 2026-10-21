// m3g1 · Proxy Hunt — render + wiring only (v3 lines 550–557). The shared <PickList>
// owns taps, marks, the counter, X-RAY / FOCUS registration and the 700 ms done delay.
import React, { useCallback, useMemo } from 'react';
import type { GameApi } from '../../contracts/game';
import { PickList } from '../../dnd/PickList';
import {
  COUNTER_LABEL, FOCUS_LINE, MISS_MESSAGE, SAFE_TAG, TARGET_TAG, V3_SCENARIO, WIN_DELAY_MS, WIN_SUMMARY,
  paperTag, type ProxyScenario,
} from './data';
import { foundLine, realLineMistake, resumeLines } from './logic';

/** `scenario` defaults to the v3 case file; a replay may inject a NOVA variation of the same shape. */
export function ProxyHuntGame({ api, scenario = V3_SCENARIO }: { api: GameApi; scenario?: ProxyScenario }): React.JSX.Element {
  const lines = useMemo(() => resumeLines(scenario), [scenario]);
  const onDone = useCallback(() => api.win(WIN_SUMMARY), [api]);
  return (
    <PickList
      lines={lines}
      api={api}
      paperTag={paperTag(scenario)}
      counterLabel={COUNTER_LABEL}
      targetTag={TARGET_TAG}
      safeTag={SAFE_TAG}
      foundLine={foundLine}
      missMessage={MISS_MESSAGE}
      mistakeFor={realLineMistake}
      focusLine={FOCUS_LINE}
      showSafeNote
      onDone={onDone}
      doneDelayMs={WIN_DELAY_MS}
    />
  );
}
