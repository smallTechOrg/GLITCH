// Shell actions: compose the pure engine rules on top of the store's single write path
// (`patch`) and push the resulting toasts onto the queue (one at a time, 2.3 s each).
// Every action takes an injectable `now` so tests control the clock.
import type { GameId, HeroId, ModuleId } from '../contracts/ids';
import type { PersistedState } from '../contracts/state';
import {
  chooseHero as chooseHeroRule,
  completeModule as completeModuleRule,
  finishStory as finishStoryRule,
  recordPowerUse as recordPowerUseRule,
  runDaily as runDailyRule,
  startGame as startGameRule,
  winGame as winGameRule,
  type WinRewards,
} from '../engine/rewards';
import { useGlitchStore } from './store';
import { toast } from '../ui/toast';

/** Run a rule on a draft of the persisted state, commit it, then show its toasts. */
function apply<R extends { toasts: string[] }>(rule: (draft: PersistedState) => R): R {
  let out: R | null = null;
  useGlitchStore.getState().patch((draft) => {
    out = rule(draft);
  });
  const r = out as unknown as R;
  r.toasts.forEach((t) => toast(t));
  return r;
}

const wrap = (toasts: string[]): { toasts: string[] } => ({ toasts });

/** App start / Home focus: daily streak + "+10 XP · DAILY xN" once per local day. */
export function runDaily(now: Date = new Date()): number {
  const s = useGlitchStore.getState();
  if (!s.hydrated || !s.profile.onboarded) return 0;
  return apply((d) => runDailyRule(d, now)).awarded;
}

/** Welcome: optional nickname (trimmed, ≤20, '' → none), mark onboarded. */
export function completeOnboarding(nickname: string | null): void {
  const s = useGlitchStore.getState();
  s.setNickname(nickname);
  s.setOnboarded();
}

export function chooseHero(mod: ModuleId, hero: HeroId, now: Date = new Date()): void {
  apply((d) => wrap(chooseHeroRule(d, mod, hero, now)));
}

/** Storytime finished (last slide or SKIP). Returns XP granted now (10 the first time). */
export function finishStory(mod: ModuleId, now: Date = new Date()): number {
  return apply((d) => finishStoryRule(d, mod, now)).xp;
}

export function startGame(hero: HeroId, now: Date = new Date()): void {
  apply((d) => wrap(startGameRule(d, hero, now)));
}

export function recordPowerUse(hero: HeroId, now: Date = new Date()): void {
  apply((d) => wrap(recordPowerUseRule(d, hero, now)));
}

export function winGame(game: GameId, hearts: number, lost: number, now: Date = new Date()): WinRewards {
  return apply((d) => winGameRule(d, game, hearts, lost, now));
}

/** Module Complete screen: +50 once. Returns XP granted now. */
export function completeModule(mod: ModuleId, now: Date = new Date()): number {
  return apply((d) => completeModuleRule(d, mod, now)).xp;
}

/** Settings → Reset progress (store rules: keeps streak, nickname, settings, device id). */
export function resetProgress(): void {
  useGlitchStore.getState().resetProgress();
}
