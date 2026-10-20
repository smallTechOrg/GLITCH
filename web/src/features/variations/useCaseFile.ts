// Game-frame hook: decides the case file for the current session and fetches a fresh one
// on replay. The seen list is read at request time and the served id is recorded on load
// (state v2 `seenScenarios`), so a device never gets the same variation twice.
import { useCallback, useEffect, useRef, useState } from 'react';
import { announce } from '../../a11y/announce';
import type { GameId } from '../../contracts/ids';
import { useGlitchStore } from '../../state/store';
import { CLASSIC_FIRST_PLAY, fetchCaseFile, wantsVariation, type CaseFile } from './caseFile';
import { CASE_FILE } from './copy';

/** Polite screen-reader line for a fetched case file (null when there is nothing to tell). */
export function caseFileAnnouncement(file: CaseFile): string | null {
  if (file.kind === 'variation') return CASE_FILE.loadedAnnounce;
  return file.note ? CASE_FILE.offlineNote : null;
}

export type CaseFileState = { status: 'loading' } | { status: 'ready'; file: CaseFile };

export interface UseCaseFile {
  state: CaseFileState;
  /** Start a new session's case file: a replay of a cleared game fetches; otherwise v3. */
  next(): void;
}

export function useCaseFile(gameId: GameId): UseCaseFile {
  const [state, setState] = useState<CaseFileState>(() =>
    wantsVariation(useGlitchStore.getState(), gameId) ? { status: 'loading' } : { status: 'ready', file: CLASSIC_FIRST_PLAY },
  );
  const reqRef = useRef(0);
  const ctrlRef = useRef<AbortController | null>(null);

  const next = useCallback(() => {
    reqRef.current += 1;
    const my = reqRef.current;
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    const s = useGlitchStore.getState();
    if (!wantsVariation(s, gameId)) {
      setState({ status: 'ready', file: CLASSIC_FIRST_PLAY });
      return;
    }
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState({ status: 'loading' });
    const seen = s.seenScenarios[gameId] ?? [];
    void fetchCaseFile(gameId, seen, { signal: ctrl.signal }).then((file) => {
      if (reqRef.current !== my) return; // superseded or unmounted
      if (file.kind === 'variation') useGlitchStore.getState().markScenarioSeen(gameId, file.variationId);
      setState({ status: 'ready', file });
      // Announced once per fetch (a fail + retry keeps the file and does not re-announce).
      const message = caseFileAnnouncement(file);
      if (message) announce(message);
    });
  }, [gameId]);

  // Opening a cleared game is itself a replay.
  useEffect(() => {
    if (wantsVariation(useGlitchStore.getState(), gameId)) next();
    return () => {
      reqRef.current += 1;
      ctrlRef.current?.abort();
    };
  }, [gameId, next]);

  return { state, next };
}
