// m3g2 · Fairness Lab — GameDefinition (v3 GM.m3g2, lines 558–568).
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { FairnessLabGame } from './Game';

const game: GameDefinition = {
  id: 'm3g2',
  module: 3,
  ...GAME_META.m3g2,
  Component: FairnessLabGame,
};

export default game;
