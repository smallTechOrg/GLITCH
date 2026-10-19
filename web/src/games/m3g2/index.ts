// m3g2 · Fairness Lab — GameDefinition (v3 GM.m3g2, lines 558–568).
import type { GameDefinition } from '../../contracts/game';
import { GOAL, INTRO, TITLE } from './data';
import { FairnessLabGame } from './Game';

const game: GameDefinition = {
  id: 'm3g2',
  module: 3,
  title: TITLE,
  goal: GOAL,
  intro: INTRO,
  Component: FairnessLabGame,
};

export default game;
