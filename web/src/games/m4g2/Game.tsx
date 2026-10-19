// m4g2 · Confidence Court — render + wiring only (v3 lines 578–580).
import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GameApi } from '../../contracts/game';
import { Icon } from '../../art/Icon';
import { SortBoard, type SortItemRenderContext } from '../../dnd/SortBoard';
import { colors, fontSize } from '../../theme/tokens';
import { PixelText } from '../../ui/PixelText';
import { HEADING, ITEM_ICON, SUBHEAD, SUMMARY, verdictLine, type AnswerItem } from './data';
import { SORT_CONFIG } from './logic';

export function ConfidenceCourtGame({ api }: { api: GameApi }): React.JSX.Element {
  const apiRef = useRef(api);
  apiRef.current = api;

  const renderItem = (it: AnswerItem, ctx: SortItemRenderContext): React.ReactNode => {
    if (ctx.compact) {
      return (
        <PixelText size={fontSize.tiny} long>
          {it.short}
        </PixelText>
      );
    }
    return (
      <View style={styles.row}>
        <Icon name={ITEM_ICON} scale={3} />
        <View style={styles.body}>
          <PixelText long size={fontSize.small} style={ctx.dimmed ? styles.strike : null}>
            {it.statement}
          </PixelText>
          <PixelText long size={fontSize.tiny} color={colors.mu}>
            {verdictLine(it.confidence, it.evidence)}
          </PixelText>
        </View>
      </View>
    );
  };

  const header = (
    <View style={styles.head}>
      <PixelText size={fontSize.h3} color={colors.ac} bold accessibilityRole="header">
        {HEADING}
      </PixelText>
      <PixelText long size={fontSize.small} color={colors.mu}>
        {SUBHEAD}
      </PixelText>
    </View>
  );

  return (
    <SortBoard<AnswerItem>
      cfg={SORT_CONFIG}
      api={api}
      layout="zones-top"
      header={header}
      renderItem={renderItem}
      onDone={() => apiRef.current.win(SUMMARY)}
      testID="m4g2-board"
    />
  );
}

const styles = StyleSheet.create({
  head: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  body: { flexShrink: 1, gap: 4 },
  strike: { textDecorationLine: 'line-through' },
});
