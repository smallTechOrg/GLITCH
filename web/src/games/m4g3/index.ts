// SCAFFOLD STUB — the slice that owns games/m4g3/** replaces this folder (data.ts, logic.ts,
// Game.tsx, index.ts). Until then the game renders "UNDER CONSTRUCTION" and nothing else.
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { UnderConstructionGame } from '../../ui/UnderConstruction';

const game: GameDefinition = {
  id: 'm4g3',
  module: 4,
  ...GAME_META.m4g3,
  Component: UnderConstructionGame,
};

export default game;
