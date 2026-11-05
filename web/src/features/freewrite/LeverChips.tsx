// Five lever chips TASK / CONTEXT / ROLE / FORMAT / LIMIT: lit (hit) or dark (missed), with an
// icon + text so colour is never the only signal. `preview` = X-RAY scan of the draft.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LEVER_IDS } from '../../contracts/ids';
import type { LeverMap } from '../../contracts/state';
import { Icon } from '../../art/Icon';
import { colors } from '../../theme/tokens';
import { Chip } from '../../ui/Chip';
import { LEVER_ICON, LEVER_LABEL, LEVER_NAME } from './data';

export interface LeverChipsProps {
  levers: LeverMap;
  preview?: boolean;
}

export function leverChipLabel(name: string, hit: boolean, preview = false): string {
  return `${name}: ${hit ? 'hit' : 'missed'}${preview ? ' (X-RAY preview)' : ''}`;
}

export function LeverChips({ levers, preview = false }: LeverChipsProps): React.JSX.Element {
  return (
    <View style={styles.row} testID={preview ? 'fw-preview' : 'fw-levers'}>
      {LEVER_IDS.map((id) => {
        const hit = levers[id];
        return (
          <Chip
            key={id}
            testID={preview ? `fw-preview-${id}` : `fw-lever-${id}`}
            label={LEVER_LABEL[id]}
            icon={LEVER_ICON[id]}
            dim={!hit}
            color={hit ? colors.ink : colors.mu}
            background={hit ? (preview ? colors.bl : colors.ok) : colors.deep}
            borderColor={hit ? colors.white : colors.ln}
            style={preview ? styles.preview : null}
            accessibilityLabel={leverChipLabel(LEVER_NAME[id], hit, preview)}
          >
            <Icon name={hit ? 'check' : 'cross'} scale={2} />
          </Chip>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  preview: { borderStyle: 'dashed' },
});
