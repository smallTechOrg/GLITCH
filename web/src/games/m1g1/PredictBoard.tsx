// One round of Train the Model. Emails sit one per line on the right; the player drags each one
// sideways into a bin on the left (or taps it, then a bin). Calls stay unjudged until VERIFY, which
// fills in the verify column beside each email. Same three input paths as SortBoard.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { Icon } from '../../art/Icon';
import { announce } from '../../a11y/announce';
import { FLASH_HOLD_MS } from '../../a11y/stepped';
import { hitTest, useDragItem, useDropZones, type ZoneRect } from '../../dnd/useDrag';
import { border, colors, fontSize, layout, shadows } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { useFocusRing } from '../../ui/focus';
import {
  ALL_RIGHT_LINE, CALL_HINT, FOCUS_CALL_LINE, NEXT_LABEL, RESULTS_LABEL, VERIFY_COLUMN, VERIFY_LABEL, ZONES,
  callCount, modelSaid, modelSaidShort, verifiedAs, verifyRowA11y, xrayCallLine, type ZoneDef,
} from './data';
import { allCalled, callMistake, firstUncalled, wrongMessage, wrongRows, zoneLabel, type Call, type Calls, type EmailRow, type Step } from './logic';

export interface PredictBoardProps {
  step: Exclude<Step, 'result'>;
  heading: string;
  rows: readonly EmailRow[];
  api: GameApi;
  onNext(): void;
  testID: string;
}

export function PredictBoard({ step, heading, rows, api, onNext, testID }: PredictBoardProps): React.JSX.Element {
  const [calls, setCalls] = useState<Calls>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ row: string; zone: Call } | null>(null);
  const live = useRef({ calls, selected, verified });
  live.current = { calls, selected, verified };
  const apiRef = useRef(api);
  apiRef.current = api;
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zones = useDropZones();
  const rects = useRef<ZoneRect[]>([]);
  const narrow = useWindowDimensions().width <= layout.mobileBreakpoint;

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const place = useCallback((id: string, zone: Call) => {
    if (apiRef.current.over || live.current.verified) return;
    const next = { ...live.current.calls, [id]: zone };
    live.current = { ...live.current, calls: next, selected: null };
    setCalls(next);
    setSelected(null);
    announce(`Called ${zoneLabel(zone)}`);
  }, []);

  useEffect(() => {
    api.registerPowers({
      scan: () => {
        if (live.current.verified) return false;
        const r = firstUncalled(rows, live.current.calls);
        if (!r) return false;
        place(r.id, r.truth);
        apiRef.current.say(xrayCallLine(zoneLabel(r.truth)), 'good');
        return true;
      },
      hint: () => {
        if (live.current.verified) return false;
        const r = firstUncalled(rows, live.current.calls);
        if (!r) return false;
        setFlash({ row: r.id, zone: r.truth });
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), FLASH_HOLD_MS);
        apiRef.current.say(FOCUS_CALL_LINE, 'good');
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drag = useMemo(
    () => ({
      start: () => {
        void zones.measure().then((r) => {
          rects.current = r;
        });
      },
      move: (x: number, y: number) => {
        const z = hitTest(rects.current, x, y);
        setHover((h) => (h === z ? h : z));
      },
      end: (id: string, x: number, y: number) => {
        setHover(null);
        // Re-measured at release: a quick flick can finish before the start measure resolves.
        void zones.measure().then((r) => {
          const z = hitTest(r, x, y);
          if (z) place(id, z as Call);
        });
      },
      cancel: () => setHover(null),
    }),
    [zones, place],
  );

  const onRowPress = (id: string): void => {
    if (api.over || verified) return;
    setSelected((s) => {
      const next = s === id ? null : id;
      live.current = { ...live.current, selected: next };
      return next;
    });
  };

  const onBinPress = (zone: Call): void => {
    const id = live.current.selected;
    if (id) place(id, zone);
  };

  const verify = (): void => {
    if (api.over || verified) return;
    setVerified(true);
    live.current = { ...live.current, verified: true };
    const wrong = wrongRows(rows, calls);
    if (wrong.length === 0) {
      api.say(ALL_RIGHT_LINE, 'good');
      return;
    }
    for (const r of wrong) {
      const call = calls[r.id];
      if (call) apiRef.current.miss(wrongMessage(step), callMistake(r, call));
    }
  };

  const called = Object.keys(calls).length;
  const ready = allCalled(rows, calls);

  return (
    <View testID={testID} style={styles.wrap}>
      <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">{heading}</PixelText>
      <View style={styles.board}>
        <View style={[styles.bins, narrow ? styles.binsNarrow : null]}>
          {ZONES.map((z) => (
            <Bin
              key={z.id}
              zone={z}
              zref={zones.ref(z.id)}
              inBin={rows.filter((r) => calls[r.id] === z.id)}
              verified={verified}
              narrow={narrow}
              hovered={hover === z.id}
              flashing={flash?.zone === z.id}
              hasSelection={selected !== null}
              disabled={api.over || verified}
              onPress={() => onBinPress(z.id as Call)}
            />
          ))}
        </View>
        <View style={styles.list}>
          <View style={styles.listHead}>
            <PixelText testID="m1g1-called" size={fontSize.tiny} color={colors.mu} style={styles.flex}>{verified ? callCount(called, rows.length) : `${CALL_HINT} ${callCount(called, rows.length)}`}</PixelText>
            <PixelText size={fontSize.tiny} color={colors.ac} style={[styles.verifyHead, narrow ? styles.verifyNarrow : null]}>{VERIFY_COLUMN}</PixelText>
          </View>
          {rows.map((r) => (
            <Row
              key={r.id}
              row={r}
              call={calls[r.id]}
              selected={selected === r.id}
              verified={verified}
              flashing={flash?.row === r.id}
              narrow={narrow}
              disabled={api.over || verified}
              drag={drag}
              onPress={() => onRowPress(r.id)}
            />
          ))}
          {verified ? (
            <PixelButton testID="m1g1-next" variant="primary" label={step === 'train' ? NEXT_LABEL : RESULTS_LABEL} disabled={api.over} onPress={onNext} fullWidth />
          ) : (
            <PixelButton testID="m1g1-verify" variant="primary" label={VERIFY_LABEL} disabled={!ready || api.over} onPress={verify} fullWidth />
          )}
        </View>
      </View>
    </View>
  );
}

interface BinProps {
  zone: ZoneDef;
  zref: (v: unknown) => void;
  /** The emails called into this bin, shown inside it so a drop visibly lands. */
  inBin: readonly EmailRow[];
  verified: boolean;
  narrow: boolean;
  hovered: boolean;
  flashing: boolean;
  hasSelection: boolean;
  disabled: boolean;
  onPress(): void;
}

function Bin({ zone, zref, inBin, verified, narrow, hovered, flashing, hasSelection, disabled, onPress }: BinProps): React.JSX.Element {
  const f = useFocusRing();
  const count = inBin.length;
  return (
    <View ref={zref} collapsable={false} style={styles.binWrap}>
      <Pressable
        testID={`dnd-zone-${zone.id}`}
        onPress={onPress}
        disabled={disabled}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        accessibilityRole="button"
        accessibilityLabel={`${zone.label} bin, ${count} called`}
        accessibilityHint={hasSelection ? 'Call the selected email' : 'Select an email first'}
        style={[styles.bin, { borderColor: zone.color, borderStyle: hovered ? 'solid' : 'dashed' }, hovered ? styles.binOver : null, flashing ? styles.binFlash : null, f.ring]}
      >
        <View style={styles.binHead}>
          <Icon name={zone.icon} scale={2} />
          <PixelText size={fontSize.small} color={zone.color} bold style={styles.center}>{zone.label}</PixelText>
          <PixelText testID={`m1g1-count-${zone.id}`} size={fontSize.small} color={colors.tx}>{String(count)}</PixelText>
        </View>
        {/* Phones show only the count: each row already shows its call, and there is no room. */}
        <View style={styles.binList}>
          {narrow ? null : inBin.map((r) => {
            const right = zone.id === r.truth;
            return (
              <View key={r.id} testID={`m1g1-in-${zone.id}-${r.id}`} style={[styles.chip, verified && !right ? styles.chipWrong : null]}>
                {verified ? <PixelText size={fontSize.tiny} color={right ? colors.ok : colors.no}>{right ? '✓' : '✗'}</PixelText> : null}
                <PixelText size={fontSize.tiny} numberOfLines={1} style={styles.flex}>{r.email}</PixelText>
              </View>
            );
          })}
        </View>
      </Pressable>
    </View>
  );
}

interface RowProps {
  row: EmailRow;
  call: Call | undefined;
  selected: boolean;
  verified: boolean;
  flashing: boolean;
  narrow: boolean;
  disabled: boolean;
  drag: { start(): void; move(x: number, y: number): void; end(id: string, x: number, y: number): void; cancel(): void };
  onPress(): void;
}

function Row({ row, call, selected, verified, flashing, narrow, disabled, drag, onPress }: RowProps): React.JSX.Element {
  const f = useFocusRing();
  const d = useDragItem({
    enabled: () => !disabled,
    onStart: drag.start,
    onMove: drag.move,
    onEnd: (x, y) => drag.end(row.id, x, y),
    onCancel: drag.cancel,
  });
  const right = call === row.truth;
  const label = call ? zoneLabel(call) : null;
  return (
    <Animated.View
      {...d.panHandlers}
      style={[styles.rowWrap, d.dragging ? styles.dragging : null, { transform: [{ translateX: d.offset.x }, { translateY: d.offset.y }] }]}
    >
      <Pressable
        testID={`dnd-item-${row.id}`}
        onPress={() => {
          if (!d.justDragged()) onPress();
        }}
        disabled={disabled}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        accessibilityRole="button"
        accessibilityLabel={`${row.email}${label ? `, called ${label}` : ''}${selected ? ', selected' : ''}${verified ? `, ${verifyRowA11y(right, zoneLabel(row.truth))}` : ''}`}
        accessibilityHint="Select, then choose a bin"
        accessibilityState={{ selected, disabled }}
        aria-selected={selected}
        style={[styles.row, selected ? styles.selected : null, flashing ? styles.flash : null, verified ? (right ? styles.rowRight : styles.rowWrong) : null, f.ring, disabled ? null : styles.grab]}
      >
        {narrow ? null : <Icon name="envelope" scale={2} />}
        <PixelText long size={fontSize.small} style={styles.flex}>{row.email}</PixelText>
        <View testID={`m1g1-verify-${row.id}`} style={[styles.verifyCell, narrow ? styles.verifyNarrow : null]}>
          {verified ? (
            <>
              <PixelText size={fontSize.tiny} color={right ? colors.ok : colors.no} bold>{`${right ? '✓' : '✗'} ${narrow ? zoneLabel(row.truth) : verifiedAs(zoneLabel(row.truth))}`}</PixelText>
              {row.model ? (
                <PixelText testID={`m1g1-model-${row.id}`} size={fontSize.tiny} color={row.model.right ? colors.ok : colors.no} accessibilityLabel={modelSaid(row.model.says, row.model.right)}>
                  {narrow ? modelSaidShort(row.model.right) : modelSaid(row.model.says, row.model.right)}
                </PixelText>
              ) : null}
            </>
          ) : label ? (
            <PixelText testID={`m1g1-call-${row.id}`} size={fontSize.tiny} color={colors.ac}>{`${label}?`}</PixelText>
          ) : (
            <PixelText size={fontSize.tiny} color={colors.mu}>—</PixelText>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, gap: 6 },
  board: { flexGrow: 1, flexDirection: 'row', gap: 8 },
  bins: { width: 250, gap: 8 },
  binsNarrow: { width: 84 },
  binWrap: { flex: 1 },
  bin: { flex: 1, minHeight: layout.zoneMinHeight, gap: 4, padding: 4, borderWidth: border.width, backgroundColor: colors.zoneBg },
  binHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6 },
  binList: { gap: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 1, paddingHorizontal: 4, backgroundColor: colors.cd },
  chipWrong: { backgroundColor: colors.ln },
  binOver: { backgroundColor: colors.zoneOver },
  binFlash: { backgroundColor: colors.zoneOver, borderColor: colors.ac },
  center: { textAlign: 'center' },
  list: { flex: 1, minWidth: 0, gap: 4, zIndex: 10 },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  flex: { flex: 1, minWidth: 0 },
  verifyHead: { width: 150, textAlign: 'center' },
  verifyNarrow: { width: 84 },
  rowWrap: { zIndex: 1 },
  dragging: { zIndex: 200, elevation: 20, opacity: 0.95 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: colors.cd, borderWidth: border.thin, borderColor: colors.ln, boxShadow: shadows.item },
  grab: { cursor: 'grab' },
  selected: { borderColor: colors.ac, boxShadow: shadows.selected },
  flash: { borderColor: colors.ac, backgroundColor: colors.ln },
  rowRight: { boxShadow: 'none' },
  rowWrong: { borderColor: colors.no, boxShadow: 'none' },
  verifyCell: { width: 150, alignItems: 'center' },
});
