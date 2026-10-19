// PLACEHOLDER (slice A1 replaces): module complete celebration.
import React from 'react';
import type { ModuleId } from '../contracts/ids';
import { getModule } from '../content/modules';
import { colors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelText } from '../ui/PixelText';
import { PlaceholderNote } from './PlaceholderNote';

export function ModuleCompleteScreen({ mod }: { mod: ModuleId }): React.JSX.Element {
  const m = getModule(mod);
  return (
    <Page testID="complete-screen">
      <PixelText size={fontSize.h2} color={m.color} accessibilityRole="header">{`MODULE ${m.id} COMPLETE`}</PixelText>
      <PixelText size={fontSize.small} color={colors.mu}>{m.title}</PixelText>
      <PlaceholderNote what="Module complete" />
    </Page>
  );
}
