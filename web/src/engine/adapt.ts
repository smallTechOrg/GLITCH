// Adapts each game to the player: the Settings help level, or in `auto`, how this game has gone.
import type { GameId } from '../contracts/ids';
import type { PersistedState } from '../contracts/state';
import { START_POWER_USES } from './session';

export type AdaptReason = 'more' | 'less' | 'struggling' | 'mastered' | null;

export interface Adaptation {
  powerUses: number;
  reason: AdaptReason;
}

/** Remembered mistakes on an uncleared game before auto help adds a power use. */
export const STRUGGLING_MISTAKES = 3;

type AdaptState = Pick<PersistedState, 'settings' | 'stars' | 'mistakes'>;

export function adaptFor(s: AdaptState, gameId: GameId): Adaptation {
  if (s.settings.help === 'more') return { powerUses: START_POWER_USES + 1, reason: 'more' };
  if (s.settings.help === 'less') return { powerUses: START_POWER_USES - 1, reason: 'less' };
  const stars = s.stars[gameId];
  if (stars === 3) return { powerUses: START_POWER_USES - 1, reason: 'mastered' };
  const struggled = s.mistakes.filter((m) => m.gameId === gameId).length >= STRUGGLING_MISTAKES;
  if (stars === undefined && struggled) return { powerUses: START_POWER_USES + 1, reason: 'struggling' };
  return { powerUses: START_POWER_USES, reason: null };
}
