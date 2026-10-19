// Pure sort-into-bins engine — semantics of v3 `sortGame` (spec/GLITCH v3.html lines 488–500;
// spec/capabilities/game-runtime.md → Sort engine). No React, no timers.
import type { IconId } from '../contracts/art';

export interface SortItem {
  id: string;
  /** Zone id this item belongs in; null = decoy (never an answer). */
  answer: string | null;
  text: string;
  /** Short label shown once placed in the "zones on top" layout (m4g1/m4g2). */
  short?: string;
  icon?: IconId;
}

export interface SortZone {
  id: string;
  label: string;
  icon?: IconId;
  color?: string;
}

export interface SortConfig<I extends SortItem = SortItem> {
  items: readonly I[];
  zones: readonly SortZone[];
  /** Per-zone capacity (m2g2 forges use 1). */
  cap?: number;
  /** Game-specific wrong-drop message (method syntax: bivariant, so SortState<I> widens). */
  wrong?(item: I, zone: SortZone): string;
}

export interface SortPlacement {
  itemId: string;
  zoneId: string;
}

export interface SortState<I extends SortItem = SortItem> {
  readonly cfg: SortConfig<I>;
  readonly placements: readonly SortPlacement[]; // in placement order
  readonly dimmed: Readonly<Record<string, true>>; // FOCUS-struck decoys
  readonly flash: SortPlacement | null; // FOCUS glowing pair
  readonly selected: string | null; // tap/keyboard selection
}

export type DropResult = 'placed' | 'wrong' | 'ignored';

export const DEFAULT_WRONG = 'Not there. Look at the clues again.';
export const SORT_DONE_DELAY_MS = 350;

export function createSort<I extends SortItem>(cfg: SortConfig<I>): SortState<I> {
  const ids = new Set<string>();
  for (const it of cfg.items) {
    if (ids.has(it.id)) throw new Error(`duplicate sort item id ${it.id}`);
    ids.add(it.id);
    if (it.answer !== null && !cfg.zones.some((z) => z.id === it.answer)) throw new Error(`item ${it.id} answers unknown zone ${it.answer}`);
  }
  return { cfg, placements: [], dimmed: {}, flash: null, selected: null };
}

export const getItem = <I extends SortItem>(s: SortState<I>, id: string): I | undefined => s.cfg.items.find((x) => x.id === id);
export const getZone = (s: SortState, id: string): SortZone | undefined => s.cfg.zones.find((z) => z.id === id);
export const isPlaced = (s: SortState, itemId: string): boolean => s.placements.some((p) => p.itemId === itemId);
export const zoneCount = (s: SortState, zoneId: string): number => s.placements.filter((p) => p.zoneId === zoneId).length;
export const zoneFull = (s: SortState, zoneId: string): boolean => !!s.cfg.cap && zoneCount(s, zoneId) >= s.cfg.cap;

/** Items placed in a zone, in placement order. */
export function placedIn<I extends SortItem>(s: SortState<I>, zoneId: string): I[] {
  return s.placements.filter((p) => p.zoneId === zoneId).map((p) => getItem(s, p.itemId)).filter((x): x is I => !!x);
}

/** Unplaced items in pool order (decoys included). */
export function poolItems<I extends SortItem>(s: SortState<I>): I[] {
  return s.cfg.items.filter((x) => !isPlaced(s, x.id));
}

/** v3 `left()`: unplaced non-decoys, pool order. */
export function remaining<I extends SortItem>(s: SortState<I>): I[] {
  return s.cfg.items.filter((x) => x.answer !== null && !isPlaced(s, x.id));
}

/** Done when every non-decoy item is placed (decoys may remain). */
export const isDone = (s: SortState): boolean => remaining(s).length === 0;

/** Message for a wrong drop (game-specific or the v3 default). */
export function wrongMessage<I extends SortItem>(s: SortState<I>, itemId: string, zoneId: string): string {
  const it = getItem(s, itemId);
  const z = getZone(s, zoneId);
  return it && z && s.cfg.wrong ? s.cfg.wrong(it, z) : DEFAULT_WRONG;
}

function place<I extends SortItem>(s: SortState<I>, itemId: string, zoneId: string): SortState<I> {
  const dimmed = { ...s.dimmed };
  delete dimmed[itemId];
  return {
    ...s,
    placements: [...s.placements, { itemId, zoneId }],
    dimmed,
    flash: s.flash && s.flash.itemId === itemId ? null : s.flash,
    selected: s.selected === itemId ? null : s.selected,
  };
}

/** Drop item on zone: ignored if unknown/already placed; placed iff right zone and room; else wrong. */
export function drop<I extends SortItem>(s: SortState<I>, itemId: string, zoneId: string): { state: SortState<I>; result: DropResult } {
  const it = getItem(s, itemId);
  const z = getZone(s, zoneId);
  if (!it || !z || isPlaced(s, itemId)) return { state: s, result: 'ignored' };
  if (it.answer === zoneId && !zoneFull(s, zoneId)) return { state: place(s, itemId, zoneId), result: 'placed' };
  return { state: { ...s, selected: null }, result: 'wrong' };
}

/** Tap/Enter on an item: toggle selection (placed items are inert). */
export function select<I extends SortItem>(s: SortState<I>, itemId: string): SortState<I> {
  if (!getItem(s, itemId) || isPlaced(s, itemId)) return s;
  return { ...s, selected: s.selected === itemId ? null : itemId };
}

/** Tap/Enter on a zone: drop the selected item there (no selection → ignored). */
export function dropSelected<I extends SortItem>(s: SortState<I>, zoneId: string): { state: SortState<I>; result: DropResult; itemId: string | null } {
  if (!s.selected) return { state: s, result: 'ignored', itemId: null };
  const itemId = s.selected;
  const r = drop({ ...s, selected: null }, itemId, zoneId);
  return { ...r, itemId };
}

/** X-RAY: place the first unplaced non-decoy into its zone; null if nothing left. */
export function xray<I extends SortItem>(s: SortState<I>): { state: SortState<I>; placed: { item: I; zone: SortZone } | null } {
  const next = remaining(s)[0];
  if (!next || next.answer === null) return { state: s, placed: null };
  const zone = getZone(s, next.answer) as SortZone;
  return { state: place(s, next.id, zone.id), placed: { item: next, zone } };
}

export type FocusEffect = { kind: 'dim'; itemId: string } | { kind: 'flash'; itemId: string; zoneId: string };

/** FOCUS: dim the first unplaced, not-yet-dimmed decoy; else flash the first remaining pair; null if nothing left. */
export function focus<I extends SortItem>(s: SortState<I>): { state: SortState<I>; effect: FocusEffect | null } {
  const decoy = s.cfg.items.find((x) => x.answer === null && !isPlaced(s, x.id) && !s.dimmed[x.id]);
  if (decoy) return { state: { ...s, dimmed: { ...s.dimmed, [decoy.id]: true } }, effect: { kind: 'dim', itemId: decoy.id } };
  const next = remaining(s)[0];
  if (!next || next.answer === null) return { state: s, effect: null };
  const flash = { itemId: next.id, zoneId: next.answer };
  return { state: { ...s, flash }, effect: { kind: 'flash', ...flash } };
}

export const clearFlash = <I extends SortItem>(s: SortState<I>): SortState<I> => (s.flash ? { ...s, flash: null } : s);

/** Bubble lines (v3 verbatim). */
export const xrayLine = (zone: SortZone): string => `X-RAY: that one goes in ${zone.label}.`;
export const FOCUS_DIM_LINE = 'FOCUS: that one is not an answer. Skip it.';
export const FOCUS_FLASH_LINE = 'FOCUS: look at the glowing pair.';
