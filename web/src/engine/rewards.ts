// Every progress-changing rule of the shell, as pure functions over a draft state (v3
// `addXp`, `bonus`, `daily`, `markDone`, hero select, `cut().fin`, `win`, `usePower`,
// `modDoneScreen`). Each returns the toasts v3 shows, in v3 order; state/actions.ts applies
// them through the store's `patch` and the toast queue. XP sources are exactly: daily +10,
// storytime +10 ×4 (once), game clear +30 ×9 (once), module +50 ×4 (once), flawless +25 (once).
import type { GameId, HeroId, ModuleId, StepId } from '../contracts/ids';
import type { PersistedState } from '../contracts/state';
import { checkBadges } from './badges';
import { starsFor } from './session';
import { DAILY_XP, applyDailyStreak, dailyReason } from './streak';
import { addXp } from './xp';

export const STORY_XP = 10;
export const GAME_CLEAR_XP = 30;
export const MODULE_XP = 50;
export const FLAWLESS_XP = 25;
export const STORY_REASON = 'STORYTIME DONE';
export const GAME_CLEAR_REASON = 'GAME CLEAR';
export const MODULE_REASON = 'MODULE COMPLETE';
export const FLAWLESS_REASON = 'FLAWLESS';
export const UNTOUCH_KEY = 'untouch';

/** Maximum one-off XP on a device (excluding daily): 4×10 + 9×30 + 4×50 + 25. */
export const MAX_ONE_OFF_XP = 4 * STORY_XP + 9 * GAME_CLEAR_XP + 4 * MODULE_XP + FLAWLESS_XP;

export const storyKey = (mod: ModuleId): string => `story${mod}`;
export const gameKey = (game: GameId): string => `g${game}`;
export const moduleKey = (mod: ModuleId): string => `mod${mod}`;

/** XP award + level-up toast + badge check (v3 `addXp`). */
export function awardXp(s: PersistedState, n: number, why: string, now: Date): string[] {
  return [...addXp(s, n, why), ...checkBadges(s, now)];
}

/** v3 `bonus`: award once per device ever. Returns the XP granted now (0 if already had). */
export function onceBonus(s: PersistedState, key: string, n: number, why: string, now: Date): { xp: number; toasts: string[] } {
  if (s.onceBonuses[key]) return { xp: 0, toasts: [] };
  s.onceBonuses[key] = true;
  return { xp: n, toasts: awardXp(s, n, why, now) };
}

/** v3 `markDone`: mark the step, then re-check badges. */
export function markStepDone(s: PersistedState, step: StepId, now: Date): string[] {
  if (s.steps[step]) return [];
  s.steps[step] = true;
  return checkBadges(s, now);
}

/** Daily visit: streak rules + "+10 XP · DAILY xN" on a new local day. */
export function runDaily(s: PersistedState, now: Date): { awarded: number; toasts: string[] } {
  const r = applyDailyStreak(s, now);
  if (!r.newDay) return { awarded: 0, toasts: [] };
  return { awarded: DAILY_XP, toasts: awardXp(s, DAILY_XP, dailyReason(r.streak), now) };
}

/** Hero select "▶ Enter": hero for the module, last hero, hero played, step m<n>h done. */
export function chooseHero(s: PersistedState, mod: ModuleId, hero: HeroId, now: Date): string[] {
  s.heroByModule[mod] = hero;
  s.lastHero = hero;
  s.heroesPlayed[hero] = true;
  const t = markStepDone(s, `m${mod}h`, now);
  return [...t, ...checkBadges(s, now)];
}

/** Storytime finish (last slide or skip): step m<n>s done + once-bonus story<n> +10. */
export function finishStory(s: PersistedState, mod: ModuleId, now: Date): { xp: number; toasts: string[] } {
  const t = markStepDone(s, `m${mod}s`, now);
  const b = onceBonus(s, storyKey(mod), STORY_XP, STORY_REASON, now);
  return { xp: b.xp, toasts: [...t, ...b.toasts] };
}

/** Game start: the hero is recorded as played (Hero Collector). */
export function startGame(s: PersistedState, hero: HeroId, now: Date): string[] {
  s.heroesPlayed[hero] = true;
  return checkBadges(s, now);
}

/** A consumed power use: the hero is recorded in "powers used" (Power User). */
export function recordPowerUse(s: PersistedState, hero: HeroId, now: Date): string[] {
  s.powersUsed[hero] = true;
  return checkBadges(s, now);
}

export interface WinRewards {
  stars: 1 | 2 | 3;
  bestStars: 1 | 2 | 3;
  gameXp: number; // +30 the first time this game is won on the device, else 0
  flawlessXp: number; // +25 the first flawless win ever, else 0
  toasts: string[];
}

/**
 * v3 `win`: stars = hearts clamped 1..3 (best kept); once-bonus g<id> +30 "GAME CLEAR";
 * lost === 0 → once-bonus untouch +25 "FLAWLESS"; the game's step marked done; badges.
 */
export function winGame(s: PersistedState, game: GameId, hearts: number, lost: number, now: Date): WinRewards {
  const stars = starsFor(hearts);
  const g = onceBonus(s, gameKey(game), GAME_CLEAR_XP, GAME_CLEAR_REASON, now);
  const best = Math.max(s.stars[game] ?? 0, stars) as 1 | 2 | 3;
  s.stars[game] = best;
  const f = lost === 0 ? onceBonus(s, UNTOUCH_KEY, FLAWLESS_XP, FLAWLESS_REASON, now) : { xp: 0, toasts: [] };
  const d = markStepDone(s, game, now);
  const b = checkBadges(s, now);
  return { stars, bestStars: best, gameXp: g.xp, flawlessXp: f.xp, toasts: [...g.toasts, ...f.toasts, ...d, ...b] };
}

/** Module Complete screen: once-bonus mod<n> +50 "MODULE COMPLETE", then badges. */
export function completeModule(s: PersistedState, mod: ModuleId, now: Date): { xp: number; toasts: string[] } {
  const b = onceBonus(s, moduleKey(mod), MODULE_XP, MODULE_REASON, now);
  return { xp: b.xp, toasts: [...b.toasts, ...checkBadges(s, now)] };
}
