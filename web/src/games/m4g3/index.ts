// m4g3 · Design the Companion (v3 lines 581–592).
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { DesignCompanionGame } from './Game';

const game: GameDefinition = {
  id: 'm4g3',
  module: 4,
  ...GAME_META.m4g3,
  Component: DesignCompanionGame,
};

export default game;
