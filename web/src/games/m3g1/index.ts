// m3g1 · Proxy Hunt — GameDefinition (v3 GM.m3g1, lines 550–557).
import type { GameDefinition } from '../../contracts/game';
import { GOAL, INTRO, TITLE } from './data';
import { ProxyHuntGame } from './Game';

const game: GameDefinition = {
  id: 'm3g1',
  module: 3,
  title: TITLE,
  goal: GOAL,
  intro: INTRO,
  Component: ProxyHuntGame,
};

export default game;
