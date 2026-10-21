// Daily streak + daily XP (v3 `daily`, line 291; course-shell.md → XP, levels, streak).
// Pure: the local date comes from an injected `now`.
import type { PersistedState } from '../contracts/state';

export const DAILY_XP = 10;
export const dailyReason = (streak: number): string => `DAILY x${streak}`;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local day before `d` (calendar arithmetic, safe across DST changes). */
export function previousDay(d: Date): string {
  return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12));
}

export interface DailyResult {
  /** True when this is a new day: streak updated and +10 XP is due. */
  newDay: boolean;
  streak: number;
}

/**
 * If the last-play day ≠ today: streak = previous + 1 when last-play day was yesterday,
 * else 1; best = max(best, streak); last-play day = today. The caller then awards
 * +10 XP "DAILY xN" (so the XP toast + badge checks share one path).
 */
export function applyDailyStreak(s: PersistedState, now: Date): DailyResult {
  const today = localDay(now);
  if (s.streak.lastPlayDay === today) return { newDay: false, streak: s.streak.current };
  const current = s.streak.lastPlayDay === previousDay(now) ? s.streak.current + 1 : 1;
  s.streak = { current, best: Math.max(s.streak.best, current), lastPlayDay: today };
  return { newDay: true, streak: current };
}
