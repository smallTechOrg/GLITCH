// FROZEN Phase-1 contract — TypeScript mirror of spec/data.md → PersistedStateV1.
import type { BadgeId, GameId, HeroId, LeverId, ModuleId, StepId } from './ids';

export const STATE_VERSION = 1 as const;
export const STATE_STORAGE_KEY = 'glitch.v1.state';
export const DEVICE_STORAGE_KEY = 'glitch.v1.device';
export const NICKNAME_MAX = 20;
export const PROMPT_HISTORY_MAX = 50;
export const DEFAULT_DISPLAY_NAME = 'PLAYER 1';

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

/** Current persisted shape (bumped with a migration in state/migrate.ts). */
export type PersistedState = PersistedStateV1;

export interface GlitchActions {
  setNickname(n: string | null): void; // trimmed, max 20, '' → null
  setOnboarded(): void;
  setReadableFont(b: boolean): void;
  /** The only general write path: fn mutates a structured clone of the persisted state. */
  patch(fn: (s: PersistedState) => void): void;
  addPromptHistory(entry: PromptHistoryEntry): void; // newest first, cap 50
  resetProgress(): void; // keeps streak, nickname, onboarded, createdAt, settings
}

export interface GlitchRuntime {
  hydrated: boolean; // true once the on-device store has been read (or failed → fresh)
  loadError: string | null; // set when saved progress was unreadable
}

export type GlitchStoreState = PersistedState & GlitchRuntime & GlitchActions;

export function displayName(nickname: string | null): string {
  return nickname && nickname.trim() ? nickname.trim() : DEFAULT_DISPLAY_NAME;
}
