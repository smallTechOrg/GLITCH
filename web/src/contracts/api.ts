// TypeScript mirror of spec/api.md. Phase-1 shapes are frozen; Phase 2 adds the scenario route.
import type { GameId } from './ids';
import type { LeverMap } from './state';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'BAD_DEVICE'
  | 'CAP_DEVICE'
  | 'CAP_GLOBAL'
  | 'AI_TIMEOUT'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_OUTPUT'
  | 'MODERATED'
  | 'INTERNAL'
  /** First-play draw landed on the classic v3 case (or nothing is cached): play v3, no note. */
  | 'NO_CASE_FILE';

/** Client-side failures (no server envelope). */
export type ClientErrorCode = 'NETWORK' | 'TIMEOUT';

export interface EnergyDTO {
  remaining: number;
  limit: number;
  resetsAt: string; // ISO, next UTC midnight
}

export interface ApiErrorBody<C extends string = ApiErrorCode> {
  code: C;
  message: string;
  retryable: boolean;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
  energy?: EnergyDTO;
}

export interface ApiErr {
  ok: false;
  error: ApiErrorBody<ApiErrorCode>;
  energy?: EnergyDTO;
}

export interface ClientErr {
  ok: false;
  error: ApiErrorBody<ClientErrorCode>;
  energy?: undefined;
}

/** What every client call resolves to. Client functions never throw. */
export type ApiResult<T> = ApiOk<T> | ApiErr | ClientErr;

export type ProviderName = 'fake' | 'openrouter';

export interface HealthDTO {
  status: 'ok';
  provider: ProviderName;
  model: string;
  env: 'dev' | 'prod';
  version: string;
}

/** GET /v1/energy → data is an empty object; the energy rides on the envelope. */
export type EnergyData = Record<string, never>;

export interface FreewriteEvaluateRequest {
  goalId: string;
  goal: string; // ≤ 200 chars
  prompt: string; // 1..600 chars after trim
}

export interface FreewriteEvaluateData {
  reply: string; // ≤ 1200 chars, light markdown
  levers: LeverMap;
  leversHit: number;
  passed: boolean; // leversHit >= 4, computed server-side
  tip: string; // ≤ 200 chars
  provider: ProviderName;
  model: string;
}

export const FREEWRITE_PROMPT_MAX = 600;
export const FREEWRITE_GOAL_MAX = 200;
export const CLIENT_TIMEOUT_MS = 8000;

/**
 * GET /v1/scenarios/{gameId}/next?seen=<comma ids> (Phase 2, scenario-variations.md).
 * `data` is the game's scenario in its wire shape; features/variations/schemas.ts validates
 * and maps it onto the game's v3 data shape. A cache hit (`cached: true`) costs no energy.
 */
export interface ScenarioNextData {
  variationId: string;
  gameId: GameId;
  data: unknown;
  cached: boolean;
}

/**
 * Bounded wait for a fresh case file before the classic (v3) one is played: the brief's ~8 s
 * AI timeout. The server caps the whole scenario pipeline (cache miss → generation, incl. its
 * one regeneration) at 7 s (`deadline_s` in api/src/glitch_api/scenarios/pipeline.py), so it
 * always answers — variation or error — before the client gives up.
 */
export const SCENARIO_TIMEOUT_MS = 8000;

/**
 * First play (`?first=1`) only reads the cache, so it is fast; past this the classic v3 case
 * plays silently rather than keeping a first-time player waiting on a cold server.
 */
export const FIRST_PLAY_TIMEOUT_MS = 3000;

/**
 * POST /v1/explain (Phase 3, ask-nova-why.md). The body has exactly these four keys; the
 * server resolves the item, the correct answer and the canned message itself.
 */
export interface ExplainRequest {
  gameId: GameId;
  variationId: string; // 'v3' or a served variation id
  itemId: string;
  answer: string;
}

export interface ExplainData {
  text: string; // ≤ 60 words, plain text
  tip: string; // ≤ 25 words, plain text
  cached: boolean; // true = served from the global cache, no energy charged
  provider: ProviderName;
}

/** Client wait for an explanation before the offline line + canned message is shown. */
export const EXPLAIN_TIMEOUT_MS = 8000;
