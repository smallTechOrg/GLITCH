// m1g2 · Fact or Fib — GameDefinition (v3 `GM.m1g2`, lines 512–519).
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { FactOrFib } from './Game';

const game: GameDefinition = {
  id: 'm1g2',
  module: 1,
  ...GAME_META.m1g2,
  Component: FactOrFib,
};

export default game;
