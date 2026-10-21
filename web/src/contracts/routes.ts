// Route helpers (scaffold-owned). One place that knows the URL shape of every step so
// screens never hand-build paths. Hrefs are app-relative; Expo Router adds the /GLITCH base.
import type { Href } from 'expo-router';
import type { GameId, ModuleId, StepId } from './ids';

export const HOME_HREF = '/' as Href;
export const WELCOME_HREF = '/welcome' as Href;
export const SETTINGS_HREF = '/settings' as Href;

export function heroHref(mod: ModuleId): Href {
  return `/module/${mod}/hero` as Href;
}
export function storyHref(mod: ModuleId): Href {
  return `/module/${mod}/story` as Href;
}
export function gameHref(mod: ModuleId, game: GameId): Href {
  return `/module/${mod}/game/${game}` as Href;
}
export function completeHref(mod: ModuleId): Href {
  return `/module/${mod}/complete` as Href;
}

/** Href for any step id: m1h → hero, m1s → story, m1g1 → game. */
export function stepHref(step: StepId): Href {
  const mod = Number(step.charAt(1)) as ModuleId;
  if (step.endsWith('h')) return heroHref(mod);
  if (step.endsWith('s')) return storyHref(mod);
  return gameHref(mod, step as GameId);
}

/** Top bar on every screen except storytime and welcome (spec/ui.md). Input: Expo Router segments. */
export function showsTopBar(segments: readonly string[]): boolean {
  if (segments[0] === 'welcome') return false;
  if (segments[0] === 'module' && segments[2] === 'story') return false;
  return true;
}
