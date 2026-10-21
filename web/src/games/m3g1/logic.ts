// m3g1 · Proxy Hunt — pure mapping of the v3 resume onto the shared pick-the-line engine.
import type { Mistake } from '../../contracts/game';
import type { PickLine } from '../../dnd/pickEngine';
import { buildMistake } from '../mistake';
import { SAFE_TAG, TARGET_TAG, FOUND_PREFIX, V3_SCENARIO, type ProxyScenario } from './data';

/** v3 resume → PickLine[] (redacted lines carry their label; v3 shows "<label>: ▮▮▮▮▮▮ REMOVED"). */
export function resumeLines(sc: ProxyScenario = V3_SCENARIO): PickLine[] {
  return sc.resume.map(([text, proxy, note]) =>
    proxy === null ? { text, label: text, isTarget: null } : { text, isTarget: proxy === 1, note },
  );
}

const indicesWhere = (p: (proxy: 1 | 0 | null) => boolean, sc: ProxyScenario): number[] =>
  sc.resume.flatMap((l, i) => (p(l[1]) ? [i] : []));

/** 0-based indices of the proxy lines (v3 lines 3–7). */
export const proxyIndices = (sc: ProxyScenario = V3_SCENARIO): number[] => indicesWhere((p) => p === 1, sc);
/** 0-based indices of the real-signal lines (v3 lines 8–11). */
export const realIndices = (sc: ProxyScenario = V3_SCENARIO): number[] => indicesWhere((p) => p === 0, sc);
/** 0-based indices of the redacted lines (NAME, GENDER). */
export const redactedIndices = (sc: ProxyScenario = V3_SCENARIO): number[] => indicesWhere((p) => p === null, sc);

/** Bubble line when a proxy is caught (tap or X-RAY): v3 `say("Proxy found! "+note)`. */
export function foundLine(line: PickLine): string {
  return FOUND_PREFIX + (line.note ?? '');
}

/** Tap on a real line (mistake table): itemId `l<index>` (`l2`–`l10`), answer `proxy`, correct `real`. */
export function realLineMistake(line: PickLine, index: number): Mistake {
  return buildMistake('m3g1', { itemId: `l${index}`, answer: 'proxy', correct: 'real', itemText: line.text, answerLabel: TARGET_TAG, correctLabel: SAFE_TAG });
}
