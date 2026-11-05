// Shared helpers for the Phase 3 per-game mistake tests (spec/architecture.md → per-game
// mistake table). Not a test file: imported by tests/games/<game>/mistakes.test.tsx.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { GameDefinition, Mistake } from '@/contracts/game';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import type { TestGameApi, TestGameApiOptions } from '@/testing/testGameApi';

export async function mount(game: GameDefinition, o: TestGameApiOptions = {}): Promise<TestGameApi> {
  const api = createTestGameApi(o);
  const G = game.Component;
  await renderWithProviders(<G api={api} />);
  return api;
}

export async function press(id: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await fireEvent.press(screen.getByTestId(id));
}

export async function place(item: string, zone: string): Promise<void> {
  await press(`dnd-item-${item}`);
  await press(`dnd-zone-${zone}`);
}

export async function tick(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

export async function power(api: TestGameApi, kind: 'scan' | 'hint'): Promise<boolean> {
  let r = false;
  await act(async () => {
    r = api.usePower(kind);
  });
  return r;
}

/** The accepted-miss payloads, in order (shield state included). */
export const recorded = (api: TestGameApi): { mistake: Mistake; shielded: boolean }[] => api.recorded;
