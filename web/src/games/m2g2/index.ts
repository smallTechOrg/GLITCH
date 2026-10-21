// m2g2 · Prompt Forge (v3 lines 541–548 + FORGE 3 · FREE WRITE) — GameDefinition.
import type { GameDefinition } from '../../contracts/game';
import { GAME_META } from '../../content/modules';
import { PromptForgeGame } from './Game';

const game: GameDefinition = {
  id: 'm2g2',
  module: 2,
  ...GAME_META.m2g2,
  Component: PromptForgeGame,
};

export default game;
