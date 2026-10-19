// m4g1 · Source Detective (v3 lines 570–577).
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { SourceDetectiveGame } from './Game';

const game: GameDefinition = {
  id: 'm4g1',
  module: 4,
  ...GAME_META.m4g1,
  Component: SourceDetectiveGame,
};

export default game;
