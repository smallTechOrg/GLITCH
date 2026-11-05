// m3g1 · Proxy Hunt — GameDefinition (v3 GM.m3g1, lines 550–557).
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { ProxyHuntGame } from './Game';

const game: GameDefinition = {
  id: 'm3g1',
  module: 3,
  ...GAME_META.m3g1,
  Component: ProxyHuntGame,
};

export default game;
