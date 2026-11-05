// Renders a content game with an injected variation (same shape as its v3 data).
import React from 'react';
import type { GameApi } from '../../contracts/game';
import { TrainTheModel } from '../../games/m1g1/Game';
import { FactOrFib } from '../../games/m1g2/Game';
import { ProxyHuntGame } from '../../games/m3g1/Game';
import { SourceDetectiveGame } from '../../games/m4g1/Game';
import { ConfidenceCourtGame } from '../../games/m4g2/Game';
import type { GameScenario } from './schemas';

export function ScenarioGame({ game, api }: { game: GameScenario; api: GameApi }): React.JSX.Element {
  switch (game.gameId) {
    case 'm1g1':
      return <TrainTheModel api={api} scenario={game.scenario} />;
    case 'm1g2':
      return <FactOrFib api={api} scenario={game.scenario} />;
    case 'm3g1':
      return <ProxyHuntGame api={api} scenario={game.scenario} />;
    case 'm4g1':
      return <SourceDetectiveGame api={api} scenario={game.scenario} />;
    case 'm4g2':
      return <ConfidenceCourtGame api={api} scenario={game.scenario} />;
  }
}
