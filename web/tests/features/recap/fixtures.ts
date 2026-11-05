// SessionMistake fixtures for the recap tests (W2 builds against the frozen SessionMistake).
import type { SessionMistake } from '@/contracts/game';

export const sm = (i: number, over: Partial<SessionMistake> = {}): SessionMistake => ({
  gameId: 'm1g1', variationId: 'v3', itemId: `e${i}`, answer: 'ok', correct: 'spam', concept: 'Training data',
  itemText: `Email ${i}`, answerLabel: 'NOT SPAM', correctLabel: 'SPAM', message: `Canned ${i}.`,
  shielded: false, at: new Date(Date.UTC(2026, 9, 20, 10, 0, i)).toISOString(), ...over,
});
