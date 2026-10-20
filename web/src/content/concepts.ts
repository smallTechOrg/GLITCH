// Phase 3 concepts (spec/architecture.md → Contracts → Phase 3): the 12 module tags in module
// order, the concept of each game item (per-game mistake table) and the concepts per game.
import type { Concept } from '../contracts/game';
import type { GameId } from '../contracts/ids';

export const CONCEPTS: readonly Concept[] = [
  'Machine learning', 'Training data', 'Generalization',
  'Weights and thresholds', 'Classification', 'Prompt engineering',
  'Dataset bias', 'Proxy variables', 'Algorithmic discrimination',
  'Hallucination', 'Verification', 'Human oversight',
];

export const isConcept = (v: unknown): v is Concept => typeof v === 'string' && (CONCEPTS as readonly string[]).includes(v);

export const CONCEPTS_BY_GAME: Readonly<Record<GameId, readonly Concept[]>> = {
  m1g1: ['Training data', 'Generalization'],
  m1g2: ['Machine learning'],
  m2g1: ['Weights and thresholds', 'Classification'],
  m2g2: ['Prompt engineering'],
  m3g1: ['Proxy variables'],
  m3g2: ['Algorithmic discrimination'],
  m4g1: ['Hallucination', 'Verification'],
  m4g2: ['Verification'],
  m4g3: ['Human oversight'],
};

/**
 * The concept an item belongs to (per-game mistake table): m1g1 test items `t*` →
 * Generalization (training emails `e*` → Training data); m2g1 round `r2` → Classification
 * (`r1` → Weights and thresholds); m4g1 `ask` trap → Verification (citations → Hallucination);
 * every other game has a single concept.
 */
export function conceptOf(gameId: GameId, itemId: string): Concept {
  switch (gameId) {
    case 'm1g1':
      return itemId.startsWith('t') ? 'Generalization' : 'Training data';
    case 'm2g1':
      return itemId === 'r2' ? 'Classification' : 'Weights and thresholds';
    case 'm4g1':
      return itemId === 'ask' ? 'Verification' : 'Hallucination';
    default:
      return CONCEPTS_BY_GAME[gameId][0] as Concept;
  }
}
