// Mistake recap — mount point on the win screen (below the tags, above the buttons) and the
// fail screen (above the buttons) (spec/architecture.md → Contracts → Phase 3 → Mount points;
// mistake-recap.md). P3-C PLACEHOLDER: an empty container. P3-W2 replaces the BODY only; the
// exported name and the props interface below are FROZEN.
import React from 'react';
import { View } from 'react-native';
import type { SessionMistake } from '../../contracts/game';
import type { Explanation } from '../tutor/AskNovaWhy';

export interface MistakeRecapProps {
  /** This run's recorded mistakes, oldest first (shielded ones included). */
  mistakes: readonly SessionMistake[];
  /** Explanations fetched this run, keyed by `mistakeKey` (itemId|answer). */
  explanations: Readonly<Record<string, Explanation>>;
}

export function MistakeRecap(_p: MistakeRecapProps): React.JSX.Element {
  return <View testID="recap" />;
}
