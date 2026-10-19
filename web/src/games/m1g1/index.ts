// SCAFFOLD STUB — the slice that owns games/m1g1/** replaces this folder (data.ts, logic.ts,
// Game.tsx, index.ts). Until then the game renders "UNDER CONSTRUCTION" and nothing else.
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { UnderConstructionGame } from '../../ui/UnderConstruction';

const game: GameDefinition = {
  id: 'm1g1',
  module: 1,
  ...GAME_META.m1g1,
  Component: UnderConstructionGame,
};

export default game;
