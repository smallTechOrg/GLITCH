// PLACEHOLDER (slice A1 replaces): hero select for a module.
import React from 'react';
import type { ModuleId } from '../contracts/ids';
import { getModule } from '../content/modules';
import { colors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelText } from '../ui/PixelText';
import { PlaceholderNote } from './PlaceholderNote';

export function HeroSelectScreen({ mod }: { mod: ModuleId }): React.JSX.Element {
  const m = getModule(mod);
  return (
    <Page testID="hero-screen">
      <PixelText size={fontSize.tiny} color={colors.ac}>{`MODULE ${m.id} · ${m.title.toUpperCase()}`}</PixelText>
      <PixelText size={fontSize.h2} color={colors.ac} accessibilityRole="header">CHOOSE YOUR HERO</PixelText>
      <PlaceholderNote what="Hero select" />
    </Page>
  );
}
