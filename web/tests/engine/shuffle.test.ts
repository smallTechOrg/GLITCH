import { setShuffleDisabled, shuffled, shuffledOrder } from '@/engine/shuffle';

describe('shuffle', () => {
  afterEach(() => setShuffleDisabled(true)); // the Jest default (src/testing/jestSetup.ts)

  it('keeps the authored order while tests have it switched off', () => {
    expect(shuffledOrder(6)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('is a permutation, and different plays give different orders', () => {
    setShuffleDisabled(false);
    const orders = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const o = shuffledOrder(6);
      expect([...o].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      orders.add(o.join(','));
    }
    expect(orders.size).toBeGreaterThan(10); // P(≤ 10 distinct of 720 in 30 draws) is negligible
  });

  it('a spam/not-spam list does not simply alternate', () => {
    setShuffleDisabled(false);
    let seq = 0;
    const rng = () => [0.9, 0.1, 0.5, 0.3, 0.7][seq++ % 5]!;
    const out = shuffled(['s1', 'n1', 's2', 'n2', 's3', 'n3'], rng);
    expect(out).not.toEqual(['s1', 'n1', 's2', 'n2', 's3', 'n3']);
    expect([...out].sort()).toEqual(['n1', 'n2', 'n3', 's1', 's2', 's3']);
  });
});
