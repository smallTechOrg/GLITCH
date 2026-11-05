// Answer choices are shuffled every play so their positions can't be learnt (spam always second,
// glitches always the even lines, …). Item ids never change, only the order they are shown in.
// Tests switch shuffling off so they can rely on the authored order.

type Rng = () => number;

const flag = globalThis as { __GLITCH_NO_SHUFFLE__?: boolean };

/** Tests only: `true` keeps the authored order everywhere (the Jest setup and E2E fixture set it). */
export function setShuffleDisabled(off: boolean): void {
  flag.__GLITCH_NO_SHUFFLE__ = off;
}

const disabled = (): boolean => flag.__GLITCH_NO_SHUFFLE__ === true;

/** A random permutation of 0..n-1 (Fisher–Yates), or the identity when shuffling is off. */
export function shuffledOrder(n: number, rng: Rng = Math.random): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  if (disabled()) return order;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function shuffled<T>(xs: readonly T[], rng: Rng = Math.random): T[] {
  return shuffledOrder(xs.length, rng).map((i) => xs[i]!);
}
