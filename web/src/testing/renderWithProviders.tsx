// Render helper for component tests: fresh hydrated store (optionally seeded), empty toast
// queue, then RNTL render (async in RNTL v14).
import type React from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { PersistedState } from '../contracts/state';
import { resetStoreForTests } from '../state/store';
import { resetToasts } from '../ui/toast';

export interface ProviderOptions extends RenderOptions {
  state?: Partial<PersistedState>;
  now?: Date;
}

export async function renderWithProviders(ui: React.ReactElement, { state, now, ...rest }: ProviderOptions = {}) {
  resetStoreForTests(state ?? {}, now);
  resetToasts();
  return render(ui, rest);
}

export { createTestGameApi } from './testGameApi';
