// Phase 3 (spec/architecture.md → Contracts → Phase 3 → per-game mistake table): the one
// builder every game uses for its `miss(message, mistake)` payload. `concept` is always
// derived with `conceptOf(gameId, itemId)` so the client and the server extractor agree.
import type { Mistake } from '../contracts/game';
import type { GameId } from '../contracts/ids';
import { conceptOf } from '../content/concepts';

export const ITEM_TEXT_MAX = 160;

export interface MistakeParts {
  itemId: string;
  answer: string;
  correct: string;
  itemText: string;
  answerLabel: string;
  correctLabel: string;
  explain?: boolean;
}

/** Clip to the contract's 160-char `itemText` bound (an ellipsis marks a clipped text). */
export function clipItemText(text: string): string {
  const t = text.trim();
  return t.length <= ITEM_TEXT_MAX ? t : `${t.slice(0, ITEM_TEXT_MAX - 1)}…`;
}

export function buildMistake(gameId: GameId, p: MistakeParts): Mistake {
  return {
    itemId: p.itemId,
    answer: p.answer,
    correct: p.correct,
    concept: conceptOf(gameId, p.itemId),
    itemText: clipItemText(p.itemText),
    answerLabel: p.answerLabel,
    correctLabel: p.correctLabel,
    explain: p.explain ?? true,
  };
}
