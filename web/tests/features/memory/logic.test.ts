// Mistake memory rules (mistake-memory.md): records newest first, cap 200, 3-star mastery
// removal, derived tallies + ranking tie-breaks, slugs.
import type { MistakeRecord } from '@/contracts/state';
import { MISTAKES_MAX } from '@/contracts/state';
import {
  addRecord, clearMastered, conceptSlug, conceptTallies, moduleOfGame, toRecord, topConcepts,
} from '@/features/memory/logic';
import { sm } from '../recap/fixtures';

const at = (sec: number): string => new Date(Date.UTC(2026, 9, 20, 10, 0, sec)).toISOString();
const rec = (over: Partial<MistakeRecord> = {}): MistakeRecord => ({
  gameId: 'm1g1', variationId: 'v3', itemId: 'e1', answer: 'ok', concept: 'Training data', shielded: false, at: at(0), ...over,
});
const proxyMiss = (i: number, sec: number): MistakeRecord => rec({ gameId: 'm3g1', itemId: `l${i}`, answer: 'ok', concept: 'Proxy variables', at: at(sec) });

describe('toRecord', () => {
  it('keeps only closed ids (no text, no labels, no message)', () => {
    expect(toRecord(sm(1, { shielded: true }))).toEqual({
      gameId: 'm1g1', variationId: 'v3', itemId: 'e1', answer: 'ok', concept: 'Training data', shielded: true, at: at(1),
    });
  });
  it('missing `at` → the given now', () => {
    const now = new Date('2026-10-20T12:00:00.000Z');
    expect(toRecord(sm(1, { at: '' }), now)?.at).toBe('2026-10-20T12:00:00.000Z');
  });
  it('malformed ids → null (never stored)', () => {
    expect(toRecord(sm(1, { itemId: 'bad id!' }))).toBeNull();
    expect(toRecord(sm(1, { answer: 'NOT SPAM' }))).toBeNull();
    expect(toRecord(sm(1, { concept: 'Vibes' as never }))).toBeNull();
    expect(toRecord(sm(1, { gameId: 'm9g9' as never }))).toBeNull();
  });
});

describe('addRecord', () => {
  it('prepends (newest first)', () => {
    const a = rec({ itemId: 'a' });
    const b = rec({ itemId: 'b' });
    expect(addRecord(addRecord([], a), b).map((r) => r.itemId)).toEqual(['b', 'a']);
  });
  it('201 recorded mistakes → 200 kept, the oldest is gone', () => {
    let list: MistakeRecord[] = [];
    for (let i = 0; i < 201; i++) list = addRecord(list, rec({ itemId: `i${i}` }));
    expect(list).toHaveLength(MISTAKES_MAX);
    expect(list[0]?.itemId).toBe('i200');
    expect(list.some((r) => r.itemId === 'i0')).toBe(false);
    expect(list[MISTAKES_MAX - 1]?.itemId).toBe('i1');
  });
});

describe('clearMastered', () => {
  const list = [proxyMiss(1, 1), proxyMiss(2, 2), rec({ concept: 'Training data' }), rec({ gameId: 'm4g1', itemId: 'ask', answer: 'cut', concept: 'Verification' })];
  it('1–2 stars remove nothing', () => {
    expect(clearMastered(list, 'm3g1', 2)).toEqual(list);
    expect(clearMastered(list, 'm3g1', 1)).toEqual(list);
  });
  it('3 stars remove every record whose concept the game teaches', () => {
    expect(clearMastered(list, 'm3g1', 3).map((r) => r.concept)).toEqual(['Training data', 'Verification']);
  });
  it('removes the concept from every game (m4g2 teaches Verification; record came from m4g1)', () => {
    expect(clearMastered(list, 'm4g2', 3).map((r) => r.concept)).toEqual(['Proxy variables', 'Proxy variables', 'Training data']);
  });
  it('shielded records are removed too', () => {
    expect(clearMastered([rec({ shielded: true })], 'm1g1', 3)).toEqual([]);
  });
});

describe('conceptTallies / topConcepts', () => {
  it('missing two proxies → Proxy variables · 2 misses, replay Proxy Hunt (m3g1, module 3)', () => {
    const t = conceptTallies([proxyMiss(2, 2), proxyMiss(1, 1)]);
    expect(t).toEqual([{ concept: 'Proxy variables', misses: 2, last: at(2), gameId: 'm3g1' }]);
    expect(moduleOfGame('m3g1')).toBe(3);
  });
  it('ranks misses desc', () => {
    const t = conceptTallies([rec({ at: at(9) }), proxyMiss(1, 1), proxyMiss(2, 2)]);
    expect(t.map((x) => x.concept)).toEqual(['Proxy variables', 'Training data']);
  });
  it('tie on misses → newest last first', () => {
    const t = conceptTallies([rec({ at: at(5) }), proxyMiss(1, 9)]);
    expect(t.map((x) => x.concept)).toEqual(['Proxy variables', 'Training data']);
  });
  it('tie on misses and last → CONCEPTS order', () => {
    const t = conceptTallies([proxyMiss(1, 3), rec({ concept: 'Machine learning', gameId: 'm1g2', itemId: 's0', answer: 'fib', at: at(3) }), rec({ at: at(3) })]);
    expect(t.map((x) => x.concept)).toEqual(['Machine learning', 'Training data', 'Proxy variables']);
  });
  it('replay game = the game of the NEWEST record with that concept', () => {
    const t = conceptTallies([rec({ gameId: 'm4g2', itemId: 'q1', answer: 'trust', concept: 'Verification', at: at(8) }), rec({ gameId: 'm4g1', itemId: 'ask', answer: 'cut', concept: 'Verification', at: at(2) })]);
    expect(t[0]).toMatchObject({ concept: 'Verification', misses: 2, gameId: 'm4g2', last: at(8) });
  });
  it('top 3 only; empty list → no rows', () => {
    const list = [
      rec({ concept: 'Machine learning', gameId: 'm1g2' }), rec({ concept: 'Training data' }), rec({ concept: 'Generalization', itemId: 't1' }),
      rec({ concept: 'Proxy variables', gameId: 'm3g1' }),
    ];
    expect(topConcepts(list)).toHaveLength(3);
    expect(topConcepts([])).toEqual([]);
  });
});

describe('conceptSlug', () => {
  it('lower case, non-alphanumerics → "-"', () => {
    expect(conceptSlug('Proxy variables')).toBe('proxy-variables');
    expect(conceptSlug('Weights and thresholds')).toBe('weights-and-thresholds');
    expect(conceptSlug('Machine learning')).toBe('machine-learning');
  });
});
