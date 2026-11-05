// Mistake memory (mistake-memory.md; spec/architecture.md → Contracts → Phase 3 → Mount
// points). Writes go through the store's `patch`; the exported signatures below are FROZEN
// (the Game Frame calls them). Each miss is saved as it happens (never batched at game end).
import type { SessionMistake } from '../../contracts/game';
import type { GameId } from '../../contracts/ids';
import { useGlitchStore } from '../../state/store';
import { addRecord, clearMastered, toRecord } from './logic';

/** Called by the frame for every accepted miss that carried a payload. */
export function rememberMistake(m: SessionMistake, now?: Date): void {
  const rec = toRecord(m, now);
  if (!rec) return; // malformed ids never reach device storage
  useGlitchStore.getState().patch((s) => {
    s.mistakes = addRecord(s.mistakes ?? [], rec);
  });
}

/** Called by the frame after every accepted win with the stars earned. */
export function onGameWon(gameId: GameId, stars: 1 | 2 | 3): void {
  if (stars !== 3) return;
  const before = useGlitchStore.getState().mistakes ?? [];
  const after = clearMastered(before, gameId, stars);
  if (after.length === before.length) return;
  useGlitchStore.getState().patch((s) => {
    s.mistakes = clearMastered(s.mistakes ?? [], gameId, stars);
  });
}
