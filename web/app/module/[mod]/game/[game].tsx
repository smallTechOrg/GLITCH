import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { parseGameId, parseModuleId } from '@/contracts/ids';
import { gameParams, isGameOfModule } from '@/content/modules';
import { GameScreen } from '@/screens/GameScreen';
import { NotFoundScreen } from '@/screens/NotFoundScreen';

export function generateStaticParams(): { mod: string; game: string }[] {
  return gameParams();
}

export default function Route(): React.JSX.Element {
  const { mod, game } = useLocalSearchParams<{ mod: string; game: string }>();
  const m = parseModuleId(mod);
  const g = parseGameId(game);
  return m && g && isGameOfModule(m, g) ? <GameScreen key={g} mod={m} gameId={g} /> : <NotFoundScreen />;
}
