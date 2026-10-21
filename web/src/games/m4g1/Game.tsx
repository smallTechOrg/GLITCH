// m4g1 · Source Detective — render + wiring only (v3 lines 570–577). Rules live in logic.ts.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { Icon } from '../../art/Icon';
import { NoDrag, SortBoard, type SortItemRenderContext } from '../../dnd/SortBoard';
import { colors, fontSize } from '../../theme/tokens';
import { PixelButton } from '../../ui/PixelButton';
import { PixelText } from '../../ui/PixelText';
import { Tag } from '../../ui/Tag';
import { Terminal } from '../../ui/Terminal';
import {
  ASK_ICON, ASK_LABEL, CHECK_LABEL, FOUND_TAG, HEADING, ITEM_ICON, LOOKUPS_LABEL, LOOKUP_ICON, NOT_FOUND_TAG, NOVA_LABEL, NOVA_REPLY, SUMMARY,
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
        <Icon name={ITEM_ICON} scale={3} />
        <PixelText long size={fontSize.small} style={[styles.citText, ctx.dimmed ? styles.strike : null]}>
          {it.text}
        </PixelText>
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
      <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">
        {HEADING}
      </PixelText>
      <View testID="m4g1-lookups" accessible accessibilityLabel={lookupsA11y(st.lookupsLeft)} style={styles.look}>
        <Icon name={LOOKUP_ICON} scale={3} />
        <PixelText size={fontSize.small} bold>{`${LOOKUPS_LABEL}${st.lookupsLeft}`}</PixelText>
      </View>
      <PixelButton label={ASK_LABEL} icon={ASK_ICON} testID="m4g1-ask-nova" disabled={st.asked || api.over} onPress={onAsk} style={styles.ask} />
      {st.asked ? <Terminal testID="m4g1-nova-reply" variant="out" label={NOVA_LABEL} text={NOVA_REPLY} /> : null}
    </View>
  );

  return (
    <SortBoard<CitationItem>
      cfg={cfg}
      api={api}
      layout="zones-top"
      header={header}
      renderItem={renderItem}
      onDone={() => apiRef.current.win(SUMMARY)}
      testID="m4g1-board"
    />
  );
}

const styles = StyleSheet.create({
  head: { gap: 10 },
  look: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ask: { alignSelf: 'flex-start' },
  cit: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 1 },
  citText: { flexShrink: 1, flexBasis: 180, flexGrow: 1 },
  strike: { textDecorationLine: 'line-through' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
