// Ask NOVA why — mount point under the speech bubble (spec/architecture.md → Contracts →
// Phase 3 → Mount points; ask-nova-why.md). P3-C PLACEHOLDER: a disabled chip while the
// chip window is open, nothing otherwise. P3-W1 replaces the BODY only; the exported names
// and the props interface below are FROZEN (the Game Frame depends on them).
import React from 'react';
import type { SessionMistake } from '../../contracts/game';
import { PixelButton } from '../../ui/PixelButton';
import { TUTOR } from './copy';

/** A fetched explanation, kept for this run so the recap can reuse it. */
export interface Explanation {
  text: string;
  tip: string;
}

export interface AskNovaWhyProps {
  /**
   * The latest recorded mistake of this run (its `explain` is never `false` — the frame does
   * not mount the component for those). Carries gameId, variationId ('v3' or the served case
   * file id), itemId/answer (the request ids) and `message`, the canned miss line shown on
   * any failure. The frame re-keys the component per mistake and unmounts it on restart.
   */
  mistake: SessionMistake;
  /**
   * True while the bubble still shows this mistake's line and < ASK_WINDOW_MS has passed
   * (the frame runs the timer). Not opened + !chipVisible → render null. Once tapped, the
   * panel stays open regardless of chipVisible until CLOSE or the next mistake (re-key).
   */
  chipVisible: boolean;
  /** Called once per received explanation with `mistakeKey(mistake)` (itemId|answer). */
  onExplained(key: string, e: Explanation): void;
}

export function AskNovaWhy({ chipVisible }: AskNovaWhyProps): React.JSX.Element | null {
  if (!chipVisible) return null;
  return <PixelButton testID="ask-nova-why" variant="small" label={TUTOR.chip} accessibilityHint={TUTOR.chipHint} disabled />;
}
