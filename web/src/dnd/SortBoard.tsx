// <SortBoard cfg api onDone layout="pool-first"|"zones-top" header? /> — the shared sort game
// UI (v3 `sortGame` + DnD helper, lines 452–500). Three input paths, always available:
//   drag (8 px threshold, hovered zone highlights), tap/click-to-select then tap a zone,
//   keyboard (Tab to an item, Enter/Space selects; Tab to a zone, Enter/Space drops —
//   RN Web maps Enter/Space on role=button to onPress).
// X-RAY / FOCUS are registered with the frame via api.registerPowers on mount.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import type { GameApi } from '../contracts/game';
import { Icon } from '../art/Icon';
import { announce } from '../a11y/announce';
import { ANIM, FLASH_HOLD_MS } from '../a11y/stepped';
import { useStepAnimation } from '../a11y/useStepAnimation';
import { border, colors, fontSize, layout as L, shadows } from '../theme/tokens';
import { PixelText } from '../ui/PixelText';
import { useFocusRing } from '../ui/focus';
import {
  FOCUS_DIM_LINE, FOCUS_FLASH_LINE, SORT_DONE_DELAY_MS,
  clearFlash, createSort, drop, dropSelected, focus, getItem, getZone, isDone, placedIn, poolItems, select, wrongMessage, xray, xrayLine, zoneFull,
  type DropResult, type SortConfig, type SortItem, type SortState, type SortZone,
} from './sortEngine';
import { hitTest, useDragItem, useDropZones, type ZoneRect } from './useDrag';

export type SortLayout = 'pool-first' | 'zones-top';

export interface SortItemRenderContext {
  placed: boolean;
  selected: boolean;
  dimmed: boolean;
  flashing: boolean;
  wrong: boolean;
  /** Placed in the zones-on-top layout → show the short label. */
  compact: boolean;
}

export interface SortBoardProps<I extends SortItem> {
  cfg: SortConfig<I>;
  api: GameApi;
  /** Fires 350 ms after the last real placement. */
  onDone: (state: SortState<I>) => void;
  layout?: SortLayout;
  header?: React.ReactNode;
  /** Custom item body (icon + text by default). Wrap inner controls in <NoDrag>. */
  renderItem?: (item: I, ctx: SortItemRenderContext) => React.ReactNode;
  onPlace?: (item: I, zone: SortZone, state: SortState<I>) => void;
  onChange?: (state: SortState<I>) => void;
  /** Default true. Set false if the game registers its own power handlers. */
  registerPowers?: boolean;
  testID?: string;
}

const SuppressCtx = createContext<{ current: boolean } | null>(null);

/** Wrap controls inside an item (e.g. m4g1 CHECK) so pressing them never starts a drag. */
export function NoDrag({ children }: { children: React.ReactNode }): React.JSX.Element {
  const ref = useContext(SuppressCtx);
  const on = (): void => {
    if (ref) ref.current = true;
  };
  const off = (): void => {
    if (ref) setTimeout(() => (ref.current = false), 0);
  };
  const web = Platform.OS === 'web' ? ({ onPointerDown: on, onPointerUp: off, onMouseDown: on, onMouseUp: off } as object) : {};
  return (
    <View onTouchStart={on} onTouchEnd={off} onTouchCancel={off} {...web}>
      {children}
    </View>
  );
}

interface DragApi {
  start(): void;
  move(x: number, y: number): void;
  end(id: string, x: number, y: number): void;
  cancel(): void;
}

export function SortBoard<I extends SortItem>({
  cfg, api, onDone, layout = 'pool-first', header, renderItem, onPlace, onChange, registerPowers = true, testID,
}: SortBoardProps<I>): React.JSX.Element {
  const [state, setState] = useState<SortState<I>>(() => createSort(cfg));
  const sref = useRef(state);
  const apiRef = useRef(api);
  apiRef.current = api;
  const cbs = useRef({ onDone, onPlace, onChange });
  cbs.current = { onDone, onPlace, onChange };
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const rects = useRef<ZoneRect[]>([]);
  const zones = useDropZones();
  const suppress = useRef(false);

  useEffect(
    () => () => {
      for (const t of [doneTimer, flashTimer, wrongTimer]) if (t.current) clearTimeout(t.current);
    },
    [],
  );

  const commit = useCallback((next: SortState<I>) => {
    sref.current = next;
    setState(next);
    cbs.current.onChange?.(next);
  }, []);

  const afterPlace = useCallback((next: SortState<I>, itemId: string, zoneId: string) => {
    const it = getItem(next, itemId);
    const z = getZone(next, zoneId);
    if (it && z) {
      announce(`Placed in ${z.label}`);
      cbs.current.onPlace?.(it, z, next);
    }
    if (isDone(next) && !doneTimer.current) {
      doneTimer.current = setTimeout(() => cbs.current.onDone(sref.current), SORT_DONE_DELAY_MS);
    }
  }, []);

  const handleResult = useCallback(
    (next: SortState<I>, result: DropResult, itemId: string, zoneId: string) => {
      if (result === 'ignored') return;
      commit(next);
      if (result === 'placed') {
        afterPlace(next, itemId, zoneId);
        return;
      }
      setWrongId(itemId);
      if (wrongTimer.current) clearTimeout(wrongTimer.current);
      wrongTimer.current = setTimeout(() => setWrongId(null), 500);
      apiRef.current.miss(wrongMessage(next, itemId, zoneId));
    },
    [afterPlace, commit],
  );

  const dropItem = useCallback(
    (itemId: string, zoneId: string) => {
      if (apiRef.current.over) return;
      const r = drop({ ...sref.current, selected: null }, itemId, zoneId);
      handleResult(r.state, r.result, itemId, zoneId);
    },
    [handleResult],
  );

  const onItemPress = useCallback(
    (itemId: string) => {
      if (apiRef.current.over || suppress.current) return;
      const next = select(sref.current, itemId);
      commit(next);
      const it = getItem(next, itemId);
      if (it) announce(next.selected === itemId ? `${it.text}, selected` : `${it.text}, not selected`);
    },
    [commit],
  );

  const onZonePress = useCallback(
    (zoneId: string) => {
      if (apiRef.current.over) return;
      const r = dropSelected(sref.current, zoneId);
      if (!r.itemId) return;
      handleResult(r.state, r.result, r.itemId, zoneId);
    },
    [handleResult],
  );

  // Powers (v3 ctl.scan / ctl.hint). Registered once per board instance — remount the
  // board (new `key`) for each step/round so the frame always holds the live handlers.
  useEffect(() => {
    if (!registerPowers) return;
    api.registerPowers({
      scan: () => {
        const r = xray(sref.current);
        if (!r.placed) return false;
        commit(r.state);
        apiRef.current.say(xrayLine(r.placed.zone), 'good');
        afterPlace(r.state, r.placed.item.id, r.placed.zone.id);
        return true;
      },
      hint: () => {
        const r = focus(sref.current);
        if (!r.effect) return false;
        commit(r.state);
        if (r.effect.kind === 'dim') {
          apiRef.current.say(FOCUS_DIM_LINE, 'good');
        } else {
          apiRef.current.say(FOCUS_FLASH_LINE, 'good');
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => commit(clearFlash(sref.current)), FLASH_HOLD_MS);
        }
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drag = useMemo<DragApi>(
    () => ({
      start: () => {
        void zones.measure().then((r) => {
          rects.current = r;
        });
      },
      move: (x, y) => {
        const z = hitTest(rects.current, x, y);
        setHover((h) => (h === z ? h : z));
      },
      end: (itemId, x, y) => {
        setHover(null);
        const z = hitTest(rects.current, x, y);
        if (z) dropItem(itemId, z);
      },
      cancel: () => setHover(null),
    }),
    [zones, dropItem],
  );

  const top = layout === 'zones-top';
  const pool = poolItems(state);

  const renderBody = (it: I, placed: boolean): React.ReactNode => {
    const ctx: SortItemRenderContext = {
      placed,
      selected: state.selected === it.id,
      dimmed: !!state.dimmed[it.id],
      flashing: state.flash?.itemId === it.id,
      wrong: wrongId === it.id,
      compact: placed && top,
    };
    if (renderItem) return renderItem(it, ctx);
    return (
      <View style={styles.itemRow}>
        {it.icon && !ctx.compact ? <Icon name={it.icon} scale={3} /> : null}
        <PixelText long size={ctx.compact ? fontSize.tiny : fontSize.small} style={[styles.itemText, ctx.dimmed ? styles.strike : null]}>
          {ctx.compact && it.short ? it.short : it.text}
        </PixelText>
      </View>
    );
  };

  const poolView = (
    <View testID="dnd-pool" style={styles.pool} accessibilityLabel="Items to sort">
      {pool.map((it) => (
        <DraggableItem
          key={it.id}
          id={it.id}
          label={it.text}
          selected={state.selected === it.id}
          dimmed={!!state.dimmed[it.id]}
          flashing={state.flash?.itemId === it.id}
          wrong={wrongId === it.id}
          disabled={api.over}
          onPress={onItemPress}
          drag={drag}
          suppress={suppress}
        >
          {renderBody(it, false)}
        </DraggableItem>
      ))}
    </View>
  );

  const zonesView = (
    <View style={[styles.zones, top ? styles.zonesTop : null]}>
      {state.cfg.zones.map((z) => {
        const inZone = placedIn(state, z.id);
        return (
          <ZoneView
            key={z.id}
            zone={z}
            zref={zones.ref(z.id)}
            hovered={hover === z.id}
            full={zoneFull(state, z.id)}
            flashing={state.flash?.zoneId === z.id}
            compact={top}
            count={inZone.length}
            disabled={api.over}
            hasSelection={!!state.selected}
            onPress={onZonePress}
            wide={state.cfg.zones.length > 2}
          >
            {inZone.map((it) => (
              <View
                key={it.id}
                testID={`dnd-item-${it.id}`}
                accessible
                accessibilityLabel={`${it.text}, placed in ${z.label}`}
                style={[styles.item, styles.placed, top ? styles.placedCompact : null]}
              >
                {renderBody(it, true)}
              </View>
            ))}
          </ZoneView>
        );
      })}
    </View>
  );

  return (
    <SuppressCtx.Provider value={suppress}>
      <View testID={testID} style={styles.board}>
        {header}
        {top ? zonesView : poolView}
        {top ? poolView : zonesView}
      </View>
    </SuppressCtx.Provider>
  );
}

interface DraggableItemProps {
  id: string;
  label: string;
  selected: boolean;
  dimmed: boolean;
  flashing: boolean;
  wrong: boolean;
  disabled: boolean;
  onPress(id: string): void;
  drag: DragApi;
  suppress: { current: boolean };
  children: React.ReactNode;
}

function DraggableItem({ id, label, selected, dimmed, flashing, wrong, disabled, onPress, drag, suppress, children }: DraggableItemProps): React.JSX.Element {
  const f = useFocusRing();
  const d = useDragItem({
    enabled: () => !disabled,
    suppressed: () => suppress.current,
    onStart: drag.start,
    onMove: drag.move,
    onEnd: (x, y) => drag.end(id, x, y),
    onCancel: drag.cancel,
  });
  const fl = useStepAnimation({ ...ANIM.flash, loop: true, play: flashing, restValue: 0 });
  const sh = useStepAnimation({ ...ANIM.shake, play: wrong, restValue: 0, trigger: wrong });
  const shakeX = sh.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: [0, -6, 6, 0] });
  return (
    <Animated.View
      {...d.panHandlers}
      style={[
        styles.itemWrap,
        d.dragging ? styles.dragging : null,
        { transform: [{ translateX: Animated.add(d.offset.x, shakeX) }, { translateY: d.offset.y }, { rotate: d.dragging ? '-3deg' : '0deg' }] },
      ]}
    >
      <Pressable
        testID={`dnd-item-${id}`}
        onPress={() => onPress(id)}
        disabled={disabled}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        accessibilityRole="button"
        accessibilityLabel={`${label}${selected ? ', selected' : ''}${dimmed ? ', not an answer' : ''}`}
        accessibilityHint="Select, then choose a zone"
        accessibilityState={{ selected, disabled }}
        aria-selected={selected}
        aria-disabled={disabled}
        style={[styles.item, selected ? styles.selected : null, dimmed ? styles.dimmed : null, wrong ? styles.wrong : null, f.ring, styles.grab]}
      >
        {children}
        {flashing ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: fl.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }) }]} />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

interface ZoneViewProps {
  zone: SortZone;
  zref: (v: unknown) => void;
  hovered: boolean;
  full: boolean;
  flashing: boolean;
  compact: boolean;
  wide: boolean;
  count: number;
  disabled: boolean;
  hasSelection: boolean;
  onPress(id: string): void;
  children: React.ReactNode;
}

function ZoneView({ zone, zref, hovered, full, flashing, compact, wide, count, disabled, hasSelection, onPress, children }: ZoneViewProps): React.JSX.Element {
  const f = useFocusRing();
  const fl = useStepAnimation({ ...ANIM.flash, loop: true, play: flashing, restValue: 0 });
  const zc = zone.color ?? colors.bl;
  return (
    <View ref={zref} collapsable={false} style={[styles.zoneWrap, wide ? styles.zoneWide : null]}>
      <Pressable
        testID={`dnd-zone-${zone.id}`}
        onPress={() => onPress(zone.id)}
        disabled={disabled}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        accessibilityRole="button"
        accessibilityLabel={`${zone.label} zone, ${count} placed${full ? ', full' : ''}`}
        accessibilityHint={hasSelection ? 'Drop the selected item here' : 'Select an item first'}
        style={[styles.zone, compact ? styles.zoneCompact : null, { borderColor: zc, borderStyle: hovered || full ? 'solid' : 'dashed' }, hovered ? styles.zoneOver : null, f.ring]}
      >
        <View style={styles.zoneLabel}>
          {zone.icon ? <Icon name={zone.icon} scale={3} /> : null}
          <PixelText size={fontSize.small} color={zc} bold>{zone.label}</PixelText>
        </View>
        <View style={[styles.zoneContent, compact ? styles.zoneContentRow : null]}>{children}</View>
        {flashing ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: fl.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }) }]} />
        ) : null}
      </Pressable>
    </View>
  );
}

const STICKY: ViewStyle = Platform.OS === 'web' ? ({ position: 'sticky', top: 58 } as unknown as ViewStyle) : {};

const styles = StyleSheet.create({
  board: { gap: 4 },
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 14, padding: 12, borderWidth: border.width, borderStyle: 'dashed', borderColor: colors.ln, minHeight: 70 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, minHeight: L.minTouch, backgroundColor: colors.cd, borderWidth: border.width, borderColor: colors.ln, boxShadow: shadows.item, maxWidth: '100%' },
  // The drag wrapper must not grow past its row, or the item's maxWidth:'100%' is measured
  // against an unbounded box and long items overflow the screen instead of wrapping.
  itemWrap: { maxWidth: '100%', flexShrink: 1, minWidth: 0 },
  grab: { cursor: 'grab' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  itemText: { flexShrink: 1 },
  selected: { borderColor: colors.ac, boxShadow: shadows.selected },
  dimmed: { opacity: 0.3 },
  strike: { textDecorationLine: 'line-through' },
  wrong: { borderColor: colors.no },
  placed: { borderColor: colors.ok, boxShadow: 'none' },
  placedCompact: { paddingVertical: 4, paddingHorizontal: 8, minHeight: 0 },
  dragging: { zIndex: 200, elevation: 20, opacity: 0.95 },
  flash: { borderWidth: 4, borderColor: colors.ac },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  zonesTop: { ...STICKY, zIndex: 30, backgroundColor: colors.bg, paddingVertical: 8, marginBottom: 8 },
  zoneWrap: { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  zoneWide: { flexBasis: 150 },
  zone: { minHeight: 120, padding: 10, borderWidth: border.width, backgroundColor: colors.zoneBg },
  zoneCompact: { minHeight: L.zoneMinHeight },
  zoneOver: { backgroundColor: colors.zoneOver },
  zoneLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  zoneContent: { gap: 8 },
  zoneContentRow: { flexDirection: 'row', flexWrap: 'wrap' },
});
