// FROZEN Phase-1 contract — TypeScript mirror of spec/api.md.
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
  | 'INTERNAL';

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
