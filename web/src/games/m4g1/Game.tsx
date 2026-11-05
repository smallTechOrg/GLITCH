// m4g1 · Source Detective — render + wiring only (v3 lines 570–577). One source at a time: its
// citation and what it says, a catalogue CHECK, then KEEP or CUT. Rules live in logic.ts.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { Icon } from '../../art/Icon';
import { NoDrag, SortBoard, type SortItemRenderContext } from '../../dnd/SortBoard';
import { border, colors, fontSize } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { Tag } from '../../ui/Tag';
import { Terminal } from '../../ui/Terminal';
import {
  ASK_ICON, ASK_LABEL, CHECK_LABEL, EXCERPT_LABEL, FOUND_TAG, HEADING, ITEM_ICON, LOOKUPS_LABEL, LOOKUP_ICON, NOT_FOUND_TAG, NOVA_LABEL, NOVA_REPLY, SUMMARY,
  V3_SCENARIO, checkA11y, itemsOf, lookupsA11y, type CitationItem, type DetectiveScenario,
} from './data';
import { ASK_MISTAKE, askNova, check, createDetective, sortConfig, type DetectiveState } from './logic';

/** Keeps Enter/Space on an inner control from also activating the surrounding item (web). */
const stopKeys =
  Platform.OS === 'web'
    ? ({ onKeyDown: (e: { stopPropagation(): void }) => e.stopPropagation(), onKeyUp: (e: { stopPropagation(): void }) => e.stopPropagation() } as object)
    : {};

/** `scenario` defaults to the v3 case file; a replay may inject a NOVA variation of the same shape. */
export function SourceDetectiveGame({ api, scenario = V3_SCENARIO }: { api: GameApi; scenario?: DetectiveScenario }): React.JSX.Element {
  const items = useMemo(() => itemsOf(scenario), [scenario]);
  const cfg = useMemo(() => sortConfig(items), [items]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [st, setSt] = useState<DetectiveState>(createDetective);
  const ref = useRef(st);
  const apiRef = useRef(api);
  apiRef.current = api;

  const commit = (next: DetectiveState): void => {
    ref.current = next;
    setSt(next);
  };

  const onCheck = useCallback((id: string) => {
    if (apiRef.current.over) return;
    const r = check(ref.current, id, itemsRef.current);
    if (r.outcome.kind === 'ignored') return;
    commit(r.state);
    apiRef.current.say(r.outcome.say.text, r.outcome.say.mood);
  }, []);

  const onAsk = (): void => {
    if (apiRef.current.over) return;
    const r = askNova(ref.current);
    if (!r.miss) return;
    commit(r.state);
    apiRef.current.miss(r.miss, { ...ASK_MISTAKE });
  };

  const renderItem = (it: CitationItem, ctx: SortItemRenderContext): React.ReactNode => {
    if (ctx.compact) {
      return (
        <PixelText size={fontSize.tiny} long>
          {it.short}
        </PixelText>
      );
    }
    const res = st.checked[it.id];
    return (
      <View style={styles.cit}>
        <View style={styles.citHead}>
          <Icon name={ITEM_ICON} scale={2} />
          <PixelText testID={`m4g1-citation-${it.id}`} long size={fontSize.small} bold style={[styles.citText, ctx.dimmed ? styles.strike : null]}>
            {it.text}
          </PixelText>
        </View>
        <View style={styles.excerpt}>
          <PixelText size={fontSize.tiny} color={colors.ac}>{EXCERPT_LABEL}</PixelText>
          <PixelText testID={`m4g1-excerpt-${it.id}`} long size={fontSize.small}>{it.excerpt}</PixelText>
        </View>
        <NoDrag>
          <View style={styles.checkRow} {...stopKeys}>
            <PixelButton
              label={CHECK_LABEL}
              variant="small"
              icon={LOOKUP_ICON}
              testID={`m4g1-check-${it.id}`}
              accessibilityLabel={checkA11y(it.short, res)}
              disabled={res !== undefined || api.over}
              onPress={() => onCheck(it.id)}
            />
            {res !== undefined ? <Tag testID={`m4g1-result-${it.id}`} label={res ? FOUND_TAG : NOT_FOUND_TAG} variant={res ? 'good' : 'bad'} /> : null}
          </View>
        </NoDrag>
      </View>
    );
  };

  const header = (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header" style={styles.flex}>
          {HEADING}
        </PixelText>
        <View testID="m4g1-lookups" accessible accessibilityLabel={lookupsA11y(st.lookupsLeft)} style={styles.look}>
          <Icon name={LOOKUP_ICON} scale={2} />
          <PixelText size={fontSize.small} bold>{`${LOOKUPS_LABEL}${st.lookupsLeft}`}</PixelText>
        </View>
      </View>
      {st.asked ? (
        <Terminal testID="m4g1-nova-reply" variant="out" label={NOVA_LABEL} text={NOVA_REPLY} />
      ) : (
        <PixelButton label={ASK_LABEL} variant="small" icon={ASK_ICON} testID="m4g1-ask-nova" disabled={api.over} onPress={onAsk} style={styles.ask} />
      )}
    </View>
  );

  return (
    <SortBoard<CitationItem>
      cfg={cfg}
      api={api}
      layout="side"
      deck
      header={header}
      renderItem={renderItem}
      onDone={() => apiRef.current.win(SUMMARY)}
      testID="m4g1-board"
    />
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  look: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ask: { alignSelf: 'flex-start' },
  cit: { gap: 6, flexShrink: 1, flexGrow: 1, paddingVertical: 2 },
  citHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  citText: { flexShrink: 1, flexGrow: 1 },
  excerpt: { gap: 2, paddingVertical: 4, paddingHorizontal: 6, backgroundColor: colors.deep, borderLeftWidth: border.width, borderLeftColor: colors.ac },
  strike: { textDecorationLine: 'line-through' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
