// m3g1 · Proxy Hunt — render + wiring only (v3 lines 550–557). The shared <PickList>
// owns taps, marks, the counter, X-RAY / FOCUS registration and the 700 ms done delay.
import React, { useCallback, useMemo } from 'react';
import type { GameApi } from '../../contracts/game';
import { PickList } from '../../dnd/PickList';
import {
  COUNTER_LABEL, FOCUS_LINE, MISS_MESSAGE, PAPER_TAG, SAFE_TAG, TARGET_TAG, WIN_DELAY_MS, WIN_SUMMARY,
} from './data';
import { foundLine, resumeLines } from './logic';

export function ProxyHuntGame({ api }: { api: GameApi }): React.JSX.Element {
  const lines = useMemo(resumeLines, []);
  const onDone = useCallback(() => api.win(WIN_SUMMARY), [api]);
  return (
    <PickList
      lines={lines}
      api={api}
      paperTag={PAPER_TAG}
      counterLabel={COUNTER_LABEL}
      targetTag={TARGET_TAG}
      safeTag={SAFE_TAG}
      foundLine={foundLine}
      missMessage={MISS_MESSAGE}
      focusLine={FOCUS_LINE}
      showSafeNote
      onDone={onDone}
      doneDelayMs={WIN_DELAY_MS}
    />
  );
}
