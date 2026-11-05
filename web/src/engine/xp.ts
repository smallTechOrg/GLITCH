// XP and levels (v3 `lvl`, `addXp`, lines 290–300). Pure: callers pass a draft state.
import type { PersistedState } from '../contracts/state';

export const XP_PER_LEVEL = 100;

/** Level = floor(XP / 100) + 1 (v3 `lvl`). */
export function levelOf(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

/** XP shown on the level bar: XP mod 100. */
export function xpIntoLevel(xp: number): number {
  return Math.max(0, xp) % XP_PER_LEVEL;
}

export const xpToast = (n: number, why?: string): string => `+${n} XP${why ? ` · ${why}` : ''}`;
export const levelUpToast = (lvl: number): string => `LEVEL UP! LVL ${lvl}`;

/**
 * Add XP to the draft. Returns the toasts v3 shows, in order: "+n XP · WHY", then
 * "LEVEL UP! LVL n" when a level boundary is crossed. (Badge checks are the caller's job.)
 */
export function addXp(s: PersistedState, n: number, why?: string): string[] {
  const amount = Math.max(0, Math.floor(n));
  const before = levelOf(s.xp);
  s.xp += amount;
  const after = levelOf(s.xp);
  const out = [xpToast(amount, why)];
  if (after > before) out.push(levelUpToast(after));
  return out;
}
