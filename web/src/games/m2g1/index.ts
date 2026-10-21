// m2g1 · Tune the Sorter (v3 lines 521–540) — GameDefinition.
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { TuneTheSorterGame } from './Game';

const game: GameDefinition = {
  id: 'm2g1',
  module: 2,
  ...GAME_META.m2g1,
  Component: TuneTheSorterGame,
};

export default game;
