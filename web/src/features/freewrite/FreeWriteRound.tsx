// FORGE 3 · FREE WRITE — frozen Phase-1 contract (spec/architecture.md → Contracts):
//   export interface FreeWriteRoundProps { api: GameApi; onPassed: () => void }
//   export function FreeWriteRound(props: FreeWriteRoundProps): JSX.Element;
// m2g2 renders it after forge 2; onPassed → m2g2 calls api.win(<v3 summary>).
import React from 'react';
import { evaluateFreewrite, getEnergy } from '../../api/client';
import type { GameApi } from '../../contracts/game';
import { FreeWriteForge, type FreewriteClient } from './FreeWriteForge';

export interface FreeWriteRoundProps {
  api: GameApi;
  onPassed: () => void;
}

const defaultClient: FreewriteClient = { getEnergy, evaluateFreewrite };

export function FreeWriteRound(props: FreeWriteRoundProps): React.JSX.Element {
  return <FreeWriteForge api={props.api} onPassed={props.onPassed} client={defaultClient} />;
}
