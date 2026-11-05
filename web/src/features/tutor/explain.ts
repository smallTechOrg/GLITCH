// Ask NOVA why — request + per-page memo (ask-nova-why.md → Business Rules). Ids only go on the
// wire (the client's explainBody). Every explanation received in this page lifetime is kept in
// memory, keyed like the server cache (game, variation, item, answer), so asking again makes no
// network call; concurrent asks for the same key share ONE request (no double charge).
import type { ApiClient } from '../../api/client';
import { createApiClient } from '../../api/client';
import type { EnergyDTO, ExplainData } from '../../contracts/api';
import type { SessionMistake } from '../../contracts/game';

export type ExplainOutcome =
  | { kind: 'ok'; data: ExplainData; energy?: EnergyDTO; fromMemo: boolean }
  | { kind: 'fail'; reason: 'offline' | 'noEnergy'; energy?: EnergyDTO };

let client: Pick<ApiClient, 'explainMistake'> = createApiClient();
const memo = new Map<string, ExplainData>();
const inflight = new Map<string, Promise<ExplainOutcome>>();

/** The server cache key: `<gameId>|<variationId>|<itemId>|<answer>`. */
export const explainKey = (m: Pick<SessionMistake, 'gameId' | 'variationId' | 'itemId' | 'answer'>): string =>
  `${m.gameId}|${m.variationId}|${m.itemId}|${m.answer}`;

/** Tests only: swap the client (fake fetch) and clear the memo. Returns a restore function. */
export function setTutorClientForTests(c: Pick<ApiClient, 'explainMistake'>): () => void {
  const prev = client;
  client = c;
  resetTutorMemoForTests();
  return () => {
    client = prev;
    resetTutorMemoForTests();
  };
}

export function resetTutorMemoForTests(): void {
  memo.clear();
  inflight.clear();
}

/** Never throws, never rejects. A memo hit resolves without a request. */
export function askNovaWhy(m: SessionMistake): Promise<ExplainOutcome> {
  const key = explainKey(m);
  const known = memo.get(key);
  if (known) return Promise.resolve({ kind: 'ok', data: known, fromMemo: true });
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = client
    .explainMistake({ gameId: m.gameId, variationId: m.variationId, itemId: m.itemId, answer: m.answer })
    .then((r): ExplainOutcome => {
      if (r.ok) {
        memo.set(key, r.data);
        return { kind: 'ok', data: r.data, energy: r.energy, fromMemo: false };
      }
      return { kind: 'fail', reason: r.error.code === 'CAP_DEVICE' ? 'noEnergy' : 'offline', energy: r.energy };
    })
    .catch((): ExplainOutcome => ({ kind: 'fail', reason: 'offline' }))
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
