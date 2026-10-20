// Game-frame hook: decides the case file for the current session. A first play of a content
// game draws among v3 + cached case files (`first`); a replay fetches a fresh one. The seen list is read at request time and the served id is recorded on load
// (state v2 `seenScenarios`), so a device never gets the same variation twice.
import { useCallback, useEffect, useRef, useState } from 'react';
import { announce } from '../../a11y/announce';
import { FIRST_PLAY_TIMEOUT_MS } from '../../contracts/api';
import type { GameId } from '../../contracts/ids';
import { useGlitchStore } from '../../state/store';
import { CLASSIC_FIRST_PLAY, fetchCaseFile, wantsVariation, type CaseFile } from './caseFile';
import { isContentGame } from './schemas';
import { CASE_FILE } from './copy';

/** Polite screen-reader line for a fetched case file (null when there is nothing to tell). */
export function caseFileAnnouncement(file: CaseFile): string | null {
  if (file.kind === 'variation') return CASE_FILE.loadedAnnounce;
  return file.note ? CASE_FILE.offlineNote : null;
}

/** `first`: a first play is being drawn (shown as "opening", not "pulling a new" case file). */
export type CaseFileState = { status: 'loading'; first: boolean } | { status: 'ready'; file: CaseFile };

export interface UseCaseFile {
  state: CaseFileState;
  /** Start a new session's case file: a replay fetches a fresh one, a first play draws; else v3. */
  next(): void;
}

export function useCaseFile(gameId: GameId): UseCaseFile {
  const [state, setState] = useState<CaseFileState>(() =>
    isContentGame(gameId) ? { status: 'loading', first: !wantsVariation(useGlitchStore.getState(), gameId) } : { status: 'ready', file: CLASSIC_FIRST_PLAY },
  );
  const reqRef = useRef(0);
  const ctrlRef = useRef<AbortController | null>(null);

  const next = useCallback(() => {
    reqRef.current += 1;
    const my = reqRef.current;
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    const s = useGlitchStore.getState();
    if (!isContentGame(gameId)) {
      setState({ status: 'ready', file: CLASSIC_FIRST_PLAY });
      return;
    }
    const first = !wantsVariation(s, gameId);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ status: 'loading', first });
    const seen = s.seenScenarios[gameId] ?? [];
    const opts = first ? { signal: ctrl.signal, first, timeoutMs: FIRST_PLAY_TIMEOUT_MS } : { signal: ctrl.signal };
    void fetchCaseFile(gameId, seen, opts).then((file) => {
      if (reqRef.current !== my) return; // superseded or unmounted
      if (file.kind === 'variation') useGlitchStore.getState().markScenarioSeen(gameId, file.variationId);
      setState({ status: 'ready', file });
      // Announced once per fetch (a fail + retry keeps the file and does not re-announce).
      const message = caseFileAnnouncement(file);
      if (message) announce(message);
    });
  }, [gameId]);

  // Opening a content game draws its case file (a first play) or fetches a fresh one (a replay).
  useEffect(() => {
    if (isContentGame(gameId)) next();
    return () => {
      reqRef.current += 1;
      ctrlRef.current?.abort();
    };
  }, [gameId, next]);

  return { state, next };
}
