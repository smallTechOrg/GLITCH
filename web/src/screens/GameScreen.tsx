// PLACEHOLDER (slice A1 replaces with the real Game Frame: hearts, powers, shield, bubble,
// win/fail). Renders the game's title, goal and its component with an inert API.
import React, { useMemo } from 'react';
import type { GameId, ModuleId } from '../contracts/ids';
import type { GameApi } from '../contracts/game';
import { GAMES } from '../games/registry';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useGlitchStore } from '../state/store';
import { toast } from '../ui/toast';
import { colors, fontSize } from '../theme/tokens';
import { Page } from '../ui/Page';
import { PixelText } from '../ui/PixelText';
import { PlaceholderNote } from './PlaceholderNote';

export function GameScreen({ mod, gameId }: { mod: ModuleId; gameId: GameId }): React.JSX.Element {
  const g = GAMES[gameId];
  const hero = useGlitchStore((s) => s.heroByModule[mod] ?? s.lastHero);
  const reducedMotion = useReducedMotion();
  const api = useMemo<GameApi>(
    () => ({ hero, hearts: 3, over: false, reducedMotion, say: () => undefined, miss: () => undefined, win: () => undefined, registerPowers: () => undefined, toast }),
    [hero, reducedMotion],
  );
  return (
    <Page testID="game-screen">
      <PixelText testID="game-title" size={fontSize.h3} color={colors.ac} accessibilityRole="header">{g.title}</PixelText>
      <PixelText testID="game-goal" size={fontSize.tiny} color={colors.mu}>{g.goal}</PixelText>
      <PlaceholderNote what="Game frame" />
      <g.Component api={api} />
    </Page>
  );
}
