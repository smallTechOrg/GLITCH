// Every game, keyed by id. Scaffold-owned: each slice replaces only games/<id>/**.
import type { GameId } from '../contracts/ids';
import type { GameDefinition } from '../contracts/game';
import m1g1 from './m1g1';
import m1g2 from './m1g2';
import m2g1 from './m2g1';
import m2g2 from './m2g2';
import m3g1 from './m3g1';
import m3g2 from './m3g2';
import m4g1 from './m4g1';
import m4g2 from './m4g2';
import m4g3 from './m4g3';

export const GAMES: Record<GameId, GameDefinition> = { m1g1, m1g2, m2g1, m2g2, m3g1, m3g2, m4g1, m4g2, m4g3 };

export function getGame(id: GameId): GameDefinition {
  return GAMES[id];
}
