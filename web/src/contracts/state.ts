// TypeScript mirror of spec/data.md → PersistedState. v1 is the frozen Phase-1 shape; v2
// (Phase 2) adds `seenScenarios` additively. The storage key stays `glitch.v1.state`.
import type { BadgeId, GameId, HeroId, LeverId, ModuleId, StepId } from './ids';

export const STATE_VERSION = 2 as const;
export const STATE_STORAGE_KEY = 'glitch.v1.state';
export const DEVICE_STORAGE_KEY = 'glitch.v1.device';
export const NICKNAME_MAX = 20;
export const PROMPT_HISTORY_MAX = 50;
export const DEFAULT_DISPLAY_NAME = 'PLAYER 1';
/** spec/data.md → v2: at most 100 seen variation ids per game (oldest dropped first). */
export const SEEN_SCENARIOS_MAX = 100;

export type LeverMap = Record<LeverId, boolean>;
export type PromptSource = 'nova' | 'demo' | 'offline';

export interface PromptHistoryEntry {
  id: string;
  goalId: string;
  goal: string;
  prompt: string; // learner text — device only
  levers: LeverMap;
  leversHit: number; // 0..5
  passed: boolean;
  source: PromptSource;
  at: string; // ISO
}

export interface PersistedStateV1 {
  version: 1;
  profile: { nickname: string | null; onboarded: boolean; createdAt: string };
  settings: { readableFont: boolean };
  xp: number;
  streak: { current: number; best: number; lastPlayDay: string | null }; // YYYY-MM-DD local
  steps: Partial<Record<StepId, true>>;
  stars: Partial<Record<GameId, 1 | 2 | 3>>;
  heroByModule: Partial<Record<ModuleId, HeroId>>;
  lastHero: HeroId;
  heroesPlayed: Partial<Record<HeroId, true>>;
  powersUsed: Partial<Record<HeroId, true>>;
  badges: Partial<Record<BadgeId, string>>; // unlock time ISO
  onceBonuses: Record<string, true>; // story<n>, g<gameId>, mod<n>, untouch
  promptHistory: PromptHistoryEntry[]; // newest first, max 50
}

/** Variation ids this device has been served, per game, oldest first. */
export type SeenScenarios = Partial<Record<GameId, string[]>>;

/** v2 (Phase 2): v1 + `seenScenarios`. */
export interface PersistedStateV2 extends Omit<PersistedStateV1, 'version'> {
  version: 2;
  seenScenarios: SeenScenarios;
}

/** Current persisted shape (bumped with a migration in state/migrate.ts). */
export type PersistedState = PersistedStateV2;

export interface GlitchActions {
  setNickname(n: string | null): void; // trimmed, max 20, '' → null
  setOnboarded(): void;
  setReadableFont(b: boolean): void;
  /** The only general write path: fn mutates a structured clone of the persisted state. */
  patch(fn: (s: PersistedState) => void): void;
  addPromptHistory(entry: PromptHistoryEntry): void; // newest first, cap 50
  markScenarioSeen(gameId: GameId, variationId: string): void; // append once, cap 100 per game
  resetProgress(): void; // keeps streak, nickname, onboarded, createdAt, settings, seenScenarios
}

export interface GlitchRuntime {
  hydrated: boolean; // true once the on-device store has been read (or failed → fresh)
  loadError: string | null; // set when saved progress was unreadable
}

export type GlitchStoreState = PersistedState & GlitchRuntime & GlitchActions;

export function displayName(nickname: string | null): string {
  return nickname && nickname.trim() ? nickname.trim() : DEFAULT_DISPLAY_NAME;
}
