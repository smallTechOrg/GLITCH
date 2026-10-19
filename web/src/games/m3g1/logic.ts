// m3g1 · Proxy Hunt — pure mapping of the v3 resume onto the shared pick-the-line engine.
import type { PickLine } from '../../dnd/pickEngine';
import { FOUND_PREFIX, RESUME } from './data';

/** v3 resume → PickLine[] (redacted lines carry their label; v3 shows "<label>: ▮▮▮▮▮▮ REMOVED"). */
export function resumeLines(): PickLine[] {
  return RESUME.map(([text, proxy, note]) =>
    proxy === null ? { text, label: text, isTarget: null } : { text, isTarget: proxy === 1, note },
  );
}

const indicesWhere = (p: (proxy: 1 | 0 | null) => boolean): number[] =>
  RESUME.flatMap((l, i) => (p(l[1]) ? [i] : []));

/** 0-based indices of the proxy lines (v3 lines 3–7). */
export const proxyIndices = (): number[] => indicesWhere((p) => p === 1);
/** 0-based indices of the real-signal lines (v3 lines 8–11). */
export const realIndices = (): number[] => indicesWhere((p) => p === 0);
/** 0-based indices of the redacted lines (NAME, GENDER). */
export const redactedIndices = (): number[] => indicesWhere((p) => p === null);

/** Bubble line when a proxy is caught (tap or X-RAY): v3 `say("Proxy found! "+note)`. */
export function foundLine(line: PickLine): string {
  return FOUND_PREFIX + (line.note ?? '');
}
