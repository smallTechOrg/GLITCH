// Mistake memory (mistake-memory.md; spec/architecture.md → Contracts → Phase 3 → Mount
// points). P3-C PLACEHOLDER: no-op bodies. P3-W2 replaces the BODIES only (writes go through
// the store's `patch`); the exported signatures below are FROZEN (the Game Frame calls them).
import type { SessionMistake } from '../../contracts/game';
import type { GameId } from '../../contracts/ids';

/** Called by the frame for every accepted miss that carried a payload. */
export function rememberMistake(_m: SessionMistake, _now?: Date): void {
  // placeholder: P3-W2 prepends a MistakeRecord (cap MISTAKES_MAX) via patch
}

/** Called by the frame after every accepted win with the stars earned. */
export function onGameWon(_gameId: GameId, _stars: 1 | 2 | 3): void {
  // placeholder: P3-W2 clears mastered concepts on a 3-star win
}
