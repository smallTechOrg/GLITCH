// FROZEN Phase-1 contract (spec/architecture.md → Contracts → ids.ts). Slices import, never edit.
export type HeroId = 'scout' | 'chrono' | 'guard' | 'oracle';
export type NpcId = 'z' | 'k' | 'd' | 'n'; // ZARA, KABIR, MS. D'SOUZA, NOVA
export type CharacterId = HeroId | NpcId;
export type PowerKind = 'scan' | 'rewind' | 'shield' | 'hint'; // X-RAY, REWIND, SHIELD, FOCUS
export type ModuleId = 1 | 2 | 3 | 4;
export type GameId = 'm1g1' | 'm1g2' | 'm2g1' | 'm2g2' | 'm3g1' | 'm3g2' | 'm4g1' | 'm4g2' | 'm4g3';
export type StepId = `m${ModuleId}h` | `m${ModuleId}s` | GameId;
export type BadgeId =
  | 'boot' | 'story' | 'eye' | 'smith' | 'bias' | 'fact'
  | 'untouch' | 'power' | 'heroes' | 'grad' | 'streak' | 'lvl';
export type LeverId = 'task' | 'context' | 'role' | 'format' | 'limit';
export type Mood = 'neutral' | 'bad' | 'good';

export const HERO_IDS: readonly HeroId[] = ['scout', 'chrono', 'guard', 'oracle'];
export const NPC_IDS: readonly NpcId[] = ['z', 'k', 'd', 'n'];
export const MODULE_IDS: readonly ModuleId[] = [1, 2, 3, 4];
export const GAME_IDS: readonly GameId[] = ['m1g1', 'm1g2', 'm2g1', 'm2g2', 'm3g1', 'm3g2', 'm4g1', 'm4g2', 'm4g3'];
export const BADGE_IDS: readonly BadgeId[] = [
  'boot', 'story', 'eye', 'smith', 'bias', 'fact', 'untouch', 'power', 'heroes', 'grad', 'streak', 'lvl',
];
export const LEVER_IDS: readonly LeverId[] = ['task', 'context', 'role', 'format', 'limit'];
export const STEP_IDS: readonly StepId[] = [
  'm1h', 'm1s', 'm1g1', 'm1g2',
  'm2h', 'm2s', 'm2g1', 'm2g2',
  'm3h', 'm3s', 'm3g1', 'm3g2',
  'm4h', 'm4s', 'm4g1', 'm4g2', 'm4g3',
];

export const isHeroId = (v: unknown): v is HeroId => typeof v === 'string' && (HERO_IDS as readonly string[]).includes(v);
export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
export const isStepId = (v: unknown): v is StepId => typeof v === 'string' && (STEP_IDS as readonly string[]).includes(v);
export const isBadgeId = (v: unknown): v is BadgeId => typeof v === 'string' && (BADGE_IDS as readonly string[]).includes(v);
export const isLeverId = (v: unknown): v is LeverId => typeof v === 'string' && (LEVER_IDS as readonly string[]).includes(v);
export const isModuleId = (v: unknown): v is ModuleId => typeof v === 'number' && (MODULE_IDS as readonly number[]).includes(v);

/** Parse a route param ("1".."4") into a ModuleId, or null. */
export function parseModuleId(v: unknown): ModuleId | null {
  const raw: unknown = Array.isArray(v) ? v[0] : v;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^[1-4]$/.test(raw) ? Number(raw) : NaN;
  return isModuleId(n) ? n : null;
}

/** Parse a route param into a GameId, or null. */
export function parseGameId(v: unknown): GameId | null {
  const raw: unknown = Array.isArray(v) ? v[0] : v;
  return isGameId(raw) ? raw : null;
}

/** Module a game belongs to ('m3g2' → 3). */
export function moduleOfGame(id: GameId): ModuleId {
  return Number(id.charAt(1)) as ModuleId;
}
