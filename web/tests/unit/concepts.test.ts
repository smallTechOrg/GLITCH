// content/concepts.ts (Phase 3): the 12 concepts = the module tags in module order; conceptOf
// follows the per-game mistake table; CONCEPTS_BY_GAME lists each game's concepts.
import { CONCEPTS, CONCEPTS_BY_GAME, conceptOf, isConcept } from '@/content/concepts';
import { MODULES } from '@/content/modules';
import { GAME_IDS } from '@/contracts/ids';
import { mistakeKey } from '@/contracts/game';

describe('concepts', () => {
  it('CONCEPTS equals the union of the module tags, in module order', () => {
    expect(CONCEPTS).toEqual(MODULES.flatMap((m) => m.tags));
    expect(CONCEPTS).toHaveLength(12);
  });

  it('CONCEPTS_BY_GAME covers every game with known concepts', () => {
    expect(Object.keys(CONCEPTS_BY_GAME).sort()).toEqual([...GAME_IDS].sort());
    for (const g of GAME_IDS) for (const c of CONCEPTS_BY_GAME[g]) expect(isConcept(c)).toBe(true);
    expect(CONCEPTS_BY_GAME.m1g1).toEqual(['Training data', 'Generalization']);
    expect(CONCEPTS_BY_GAME.m4g1).toEqual(['Hallucination', 'Verification']);
  });

  it('conceptOf follows the per-game mistake table', () => {
    expect(conceptOf('m1g1', 'e3')).toBe('Training data');
    expect(conceptOf('m1g1', 't2')).toBe('Generalization');
    expect(conceptOf('m1g2', 's0')).toBe('Machine learning');
    expect(conceptOf('m2g1', 'r1')).toBe('Weights and thresholds');
    expect(conceptOf('m2g1', 'r2')).toBe('Classification');
    expect(conceptOf('m2g2', 'f1.b3')).toBe('Prompt engineering');
    expect(conceptOf('m2g2', 'fw.fw1')).toBe('Prompt engineering');
    expect(conceptOf('m3g1', 'l4')).toBe('Proxy variables');
    expect(conceptOf('m3g2', 'audit')).toBe('Algorithmic discrimination');
    expect(conceptOf('m4g1', 'c2')).toBe('Hallucination');
    expect(conceptOf('m4g1', 'ask')).toBe('Verification');
    expect(conceptOf('m4g2', 'a5')).toBe('Verification');
    expect(conceptOf('m4g3', 'ship')).toBe('Human oversight');
    for (const g of GAME_IDS) expect(CONCEPTS_BY_GAME[g]).toContain(conceptOf(g, 'x1'));
  });

  it('isConcept rejects unknown strings; mistakeKey is itemId|answer', () => {
    expect(isConcept('Magic')).toBe(false);
    expect(isConcept(3)).toBe(false);
    expect(mistakeKey({ itemId: 's0', answer: 'fib' })).toBe('s0|fib');
  });
});
