// PLACEHOLDER (slice A1 replaces): full-screen storytime cutscene player.
import React from 'react';
import type { ModuleId } from '../contracts/ids';
import { getModule } from '../content/modules';
import { colors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelText } from '../ui/PixelText';
import { PlaceholderNote } from './PlaceholderNote';

export function StoryScreen({ mod }: { mod: ModuleId }): React.JSX.Element {
  const m = getModule(mod);
  return (
    <Page testID="story-root">
      <PixelText size={fontSize.tiny} color={colors.ac}>{`MODULE ${m.id}`}</PixelText>
      <PixelText size={fontSize.h2} color={colors.white} accessibilityRole="header">{m.title.toUpperCase()}</PixelText>
      <PlaceholderNote what="Storytime" />
    </Page>
  );
}
