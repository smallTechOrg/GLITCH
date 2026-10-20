// GLITCH API client. Every call resolves to ApiResult<T> and NEVER throws/rejects:
// server envelopes pass through; network failure → NETWORK; abort after timeout → TIMEOUT.
import {
  CLIENT_TIMEOUT_MS, EXPLAIN_TIMEOUT_MS, SCENARIO_TIMEOUT_MS,
  type ApiErrorCode, type ApiResult, type ClientErr, type EnergyData, type EnergyDTO,
  type ExplainData, type ExplainRequest, type FreewriteEvaluateData, type FreewriteEvaluateRequest, type HealthDTO, type ScenarioNextData,
} from '../contracts/api';
import { GAME_IDS, LEVER_IDS, type GameId } from '../contracts/ids';
import { getDeviceId } from '../state/deviceId';
import { API_BASE_URL, DEVICE_HEADER, normalizeBaseUrl } from './config';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  deviceId?: () => Promise<string>;
}

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const API_CODES: readonly ApiErrorCode[] = [
  'BAD_REQUEST', 'BAD_DEVICE', 'CAP_DEVICE', 'CAP_GLOBAL', 'AI_TIMEOUT', 'AI_UNAVAILABLE', 'AI_INVALID_OUTPUT', 'MODERATED', 'INTERNAL',
];

const clientErr = (code: ClientErr['error']['code'], message: string): ClientErr => ({ ok: false, error: { code, message, retryable: true } });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseEnergy(v: unknown): EnergyDTO | undefined {
  if (!isObj(v)) return undefined;
  const { remaining, limit, resetsAt } = v;
  if (typeof remaining !== 'number' || typeof limit !== 'number' || typeof resetsAt !== 'string') return undefined;
  return { remaining, limit, resetsAt };
}

/** Validate the generic envelope shape; anything else is an unreadable response (NETWORK). */
export function parseEnvelope<T>(body: unknown, isData: (d: unknown) => d is T): ApiResult<T> {
  if (!isObj(body) || typeof body.ok !== 'boolean') return clientErr('NETWORK', 'Unreadable response from server');
  const energy = parseEnergy(body.energy);
  if (body.ok) {
    if (!isData(body.data)) return clientErr('NETWORK', 'Unexpected response shape from server');
    return energy ? { ok: true, data: body.data, energy } : { ok: true, data: body.data };
  }
  const e = body.error;
  if (!isObj(e) || typeof e.code !== 'string') return clientErr('NETWORK', 'Unreadable error from server');
  const code = (API_CODES as readonly string[]).includes(e.code) ? (e.code as ApiErrorCode) : 'INTERNAL';
  const error = { code, message: typeof e.message === 'string' ? e.message : code, retryable: e.retryable === true };
  return energy ? { ok: false, error, energy } : { ok: false, error };
}

const isEmptyObj = (d: unknown): d is EnergyData => isObj(d);

export const isHealth = (d: unknown): d is HealthDTO =>
  isObj(d) && d.status === 'ok' && (d.provider === 'fake' || d.provider === 'openrouter') && typeof d.model === 'string';

export const isFreewriteData = (d: unknown): d is FreewriteEvaluateData => {
  if (!isObj(d)) return false;
  const l = d.levers;
  return (
    isObj(l) &&
    typeof d.reply === 'string' &&
    typeof d.tip === 'string' &&
    typeof d.leversHit === 'number' &&
    typeof d.passed === 'boolean' &&
    typeof d.model === 'string' &&
    (d.provider === 'fake' || d.provider === 'openrouter') &&
    LEVER_IDS.every((k) => typeof l[k] === 'boolean')
  );
};

export const isScenarioNext = (d: unknown): d is ScenarioNextData =>
  isObj(d) &&
  typeof d.variationId === 'string' &&
  d.variationId.length > 0 &&
  typeof d.gameId === 'string' &&
  (GAME_IDS as readonly string[]).includes(d.gameId) &&
  'data' in d &&
  d.data !== null &&
  d.data !== undefined &&
  typeof d.cached === 'boolean';

export const isExplainData = (d: unknown): d is ExplainData =>
  isObj(d) &&
  typeof d.text === 'string' &&
  d.text.trim().length > 0 &&
  typeof d.tip === 'string' &&
  typeof d.cached === 'boolean' &&
  (d.provider === 'fake' || d.provider === 'openrouter');

/** The exact wire body: only the four closed-id keys (never free text, never extra fields). */
export function explainBody(req: ExplainRequest): ExplainRequest {
  return { gameId: req.gameId, variationId: req.variationId, itemId: req.itemId, answer: req.answer };
}

/** `/v1/scenarios/<gameId>/next?seen=a,b` — ids are URL-safe; each is still encoded. */
export function scenarioNextPath(gameId: GameId, seen: readonly string[]): string {
  return `/v1/scenarios/${encodeURIComponent(gameId)}/next?seen=${seen.map(encodeURIComponent).join(',')}`;
}

export interface ApiClient {
  getHealth(opts?: RequestOptions): Promise<ApiResult<HealthDTO>>;
  getEnergy(signal?: AbortSignal): Promise<ApiResult<EnergyData>>;
  evaluateFreewrite(req: FreewriteEvaluateRequest, opts?: RequestOptions): Promise<ApiResult<FreewriteEvaluateData>>;
  getNextScenario(gameId: GameId, seen: readonly string[], opts?: RequestOptions): Promise<ApiResult<ScenarioNextData>>;
  explainMistake(req: ExplainRequest, opts?: RequestOptions): Promise<ApiResult<ExplainData>>;
}

export function createApiClient(o: ApiClientOptions = {}): ApiClient {
  const base = normalizeBaseUrl(o.baseUrl ?? API_BASE_URL);
  const doFetch: FetchLike = o.fetchImpl ?? ((i, init) => fetch(i, init));
  const device = o.deviceId ?? getDeviceId;

  async function call<T>(
    method: 'GET' | 'POST',
    path: string,
    isData: (d: unknown) => d is T,
    opts: RequestOptions & { body?: unknown; withDevice?: boolean },
  ): Promise<ApiResult<T>> {
    const ctrl = new AbortController();
    let timedOut = false;
    const timeoutMs = opts.timeoutMs ?? CLIENT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const onOuterAbort = (): void => ctrl.abort();
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else opts.signal.addEventListener('abort', onOuterAbort);
    }
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (opts.withDevice) headers[DEVICE_HEADER] = await device();
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: ctrl.signal,
      });
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        if (timedOut) return clientErr('TIMEOUT', `No response within ${timeoutMs} ms`);
        return clientErr('NETWORK', `Unreadable response (HTTP ${res.status})`);
      }
      return parseEnvelope(body, isData);
    } catch (e) {
      if (timedOut) return clientErr('TIMEOUT', `No response within ${timeoutMs} ms`);
      if (ctrl.signal.aborted) return clientErr('NETWORK', 'Request cancelled');
      return clientErr('NETWORK', e instanceof Error ? e.message : 'Network error');
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  return {
    getHealth: (opts = {}) => call('GET', '/health', isHealth, { ...opts }),
    getEnergy: (signal) => call('GET', '/v1/energy', isEmptyObj, { signal, withDevice: true }),
    evaluateFreewrite: (req, opts = {}) => call('POST', '/v1/freewrite/evaluate', isFreewriteData, { ...opts, body: req, withDevice: true }),
    getNextScenario: (gameId, seen, opts = {}) =>
      call('GET', scenarioNextPath(gameId, seen), isScenarioNext, { ...opts, timeoutMs: opts.timeoutMs ?? SCENARIO_TIMEOUT_MS, withDevice: true }),
    explainMistake: (req, opts = {}) =>
      call('POST', '/v1/explain', isExplainData, { ...opts, timeoutMs: opts.timeoutMs ?? EXPLAIN_TIMEOUT_MS, body: explainBody(req), withDevice: true }),
  };
}

const defaultClient = createApiClient();

/** GET /v1/energy (does not consume). */
export function getEnergy(signal?: AbortSignal): Promise<ApiResult<EnergyData>> {
  return defaultClient.getEnergy(signal);
}

/** POST /v1/freewrite/evaluate with an 8 s abort by default. */
export function evaluateFreewrite(
  req: FreewriteEvaluateRequest,
  { timeoutMs = CLIENT_TIMEOUT_MS, signal }: RequestOptions = {},
): Promise<ApiResult<FreewriteEvaluateData>> {
  return defaultClient.evaluateFreewrite(req, { timeoutMs, signal });
}

/** GET /v1/scenarios/{gameId}/next — never throws; times out after SCENARIO_TIMEOUT_MS. */
export function getNextScenario(gameId: GameId, seen: readonly string[], opts?: RequestOptions): Promise<ApiResult<ScenarioNextData>> {
  return defaultClient.getNextScenario(gameId, seen, opts);
}

/** POST /v1/explain (Phase 3) — never throws; times out after EXPLAIN_TIMEOUT_MS (8 s). */
export function explainMistake(req: ExplainRequest, opts?: RequestOptions): Promise<ApiResult<ExplainData>> {
  return defaultClient.explainMistake(req, opts);
}

/** GET /health — provider/model info (demo tag, E2E checks). */
export function getHealth(opts?: RequestOptions): Promise<ApiResult<HealthDTO>> {
  return defaultClient.getHealth(opts);
}
