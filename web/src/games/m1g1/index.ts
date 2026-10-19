// m1g1 · Train the Model — GameDefinition (v3 `GM.m1g1`, lines 504–511).
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { TrainTheModel } from './Game';

const game: GameDefinition = {
  id: 'm1g1',
  module: 1,
  ...GAME_META.m1g1,
  Component: TrainTheModel,
};

export default game;
