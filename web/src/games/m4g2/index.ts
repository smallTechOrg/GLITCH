// m4g2 · Confidence Court (v3 lines 578–580).
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { ConfidenceCourtGame } from './Game';

const game: GameDefinition = {
  id: 'm4g2',
  module: 4,
  ...GAME_META.m4g2,
  Component: ConfidenceCourtGame,
};

export default game;
