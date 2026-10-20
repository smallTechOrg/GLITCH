// On-device learner state: zustand + persist over AsyncStorage (localStorage on web).
// Storage key `glitch.v1.state` holds exactly the current PersistedState (v2; spec/data.md).
// Primitive actions only — A1's state/actions.ts composes rules on top of `patch`.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import {
  PROMPT_HISTORY_MAX, STATE_STORAGE_KEY, STATE_VERSION,
  type GlitchStoreState, type PersistedState, type PromptHistoryEntry,
} from '../contracts/state';
import { GAME_IDS } from '../contracts/ids';
import { addSeen, cleanHistoryEntry, cleanNickname, createInitialState, isVariationId, parseStored } from './migrate';
import { toast } from '../ui/toast';

export const LOAD_ERROR_TOAST = "Couldn't read saved progress. Starting fresh.";

const PERSISTED_KEYS = [
  'version', 'profile', 'settings', 'xp', 'streak', 'steps', 'stars', 'heroByModule',
  'lastHero', 'heroesPlayed', 'powersUsed', 'badges', 'onceBonuses', 'promptHistory', 'seenScenarios',
] as const satisfies readonly (keyof PersistedState)[];

/** The persisted slice of the store (no runtime flags, no functions). */
export function pickPersisted(s: PersistedState): PersistedState {
  const out: Record<string, unknown> = {};
  for (const k of PERSISTED_KEYS) out[k] = s[k];
  return out as unknown as PersistedState;
}

/** JSON clone — the state is plain JSON by construction. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

let lastLoadError: string | null = null;

const storage: PersistStorage<PersistedState> = {
  async getItem(name): Promise<StorageValue<PersistedState> | null> {
    lastLoadError = null;
    let text: string | null;
    try {
      text = await AsyncStorage.getItem(name);
    } catch (e) {
      lastLoadError = `Storage unreadable: ${e instanceof Error ? e.message : String(e)}`;
      return null;
    }
    const r = parseStored(text);
    if (r === null) return null;
    if (!r.ok) {
      lastLoadError = r.error;
      return null;
    }
    return { state: r.state, version: STATE_VERSION };
  },
  async setItem(name, value): Promise<void> {
    try {
      await AsyncStorage.setItem(name, JSON.stringify(pickPersisted(value.state)));
    } catch {
      // storage full / private mode: progress stays in memory for this session
    }
  },
  async removeItem(name): Promise<void> {
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

export const useGlitchStore = create<GlitchStoreState>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      hydrated: false,
      loadError: null,

      setNickname: (n) => set((s) => ({ profile: { ...s.profile, nickname: cleanNickname(n) } })),
      setOnboarded: () => set((s) => ({ profile: { ...s.profile, onboarded: true } })),
      setReadableFont: (b) => set((s) => ({ settings: { ...s.settings, readableFont: !!b } })),

      patch: (fn) => {
        const draft = clone(pickPersisted(get()));
        fn(draft);
        draft.version = STATE_VERSION;
        set(draft);
      },

      addPromptHistory: (entry: PromptHistoryEntry) => {
        const clean = cleanHistoryEntry(entry);
        if (!clean) return;
        set((s) => ({ promptHistory: [clean, ...s.promptHistory].slice(0, PROMPT_HISTORY_MAX) }));
      },

      markScenarioSeen: (gameId, variationId) => {
        if (!(GAME_IDS as readonly string[]).includes(gameId) || !isVariationId(variationId)) return;
        set((s) => ({ seenScenarios: { ...s.seenScenarios, [gameId]: addSeen(s.seenScenarios[gameId], variationId) } }));
      },

      // course-shell.md → Settings: keep streak/best/last-play day, nickname (+ onboarded,
      // createdAt) and the readable-font setting; clear everything else incl. prompt history.
      // The device id lives under its own key and is untouched; so is `seenScenarios`
      // (scenario-variations.md: never repeat a variation already seen on THIS device).
      resetProgress: () => {
        const s = get();
        const fresh = createInitialState(new Date(s.profile.createdAt));
        set({
          ...fresh,
          profile: { ...s.profile },
          settings: { ...s.settings },
          streak: { ...s.streak },
          seenScenarios: JSON.parse(JSON.stringify(s.seenScenarios)) as PersistedState['seenScenarios'],
        });
      },
    }),
    {
      name: STATE_STORAGE_KEY,
      version: STATE_VERSION,
      storage,
      skipHydration: true,
      partialize: (s) => pickPersisted(s),
      merge: (persisted, current) => ({ ...current, ...(persisted as PersistedState | undefined) }),
      onRehydrateStorage: () => (_state, error) => {
        const err = error ? `Storage unreadable: ${String(error)}` : lastLoadError;
        useGlitchStore.setState({ hydrated: true, loadError: err });
      },
    },
  ),
);

let hydrating: Promise<void> | null = null;

/**
 * Read the on-device state once (app/_layout.tsx calls this on mount). Unreadable or
 * corrupt saved progress → fresh state + toast; never throws.
 */
export function hydrateStore(): Promise<void> {
  if (!hydrating) {
    hydrating = Promise.resolve(useGlitchStore.persist.rehydrate())
      .catch(() => {
        useGlitchStore.setState({ hydrated: true, loadError: 'Storage unreadable' });
      })
      .then(() => {
        if (useGlitchStore.getState().loadError) toast(LOAD_ERROR_TOAST);
      });
  }
  return hydrating;
}

/** Tests only: reset store memory to a fresh, hydrated state (also written to storage). */
export function resetStoreForTests(overrides: Partial<PersistedState> = {}, now: Date = new Date()): void {
  hydrating = null;
  lastLoadError = null;
  useGlitchStore.setState({ ...createInitialState(now), ...clone(overrides), hydrated: true, loadError: null });
}

/** Tests only: forget that hydration ran (so hydrateStore() reads storage again). */
export function resetHydrationForTests(): void {
  hydrating = null;
  lastLoadError = null;
  useGlitchStore.setState({ hydrated: false, loadError: null });
}
