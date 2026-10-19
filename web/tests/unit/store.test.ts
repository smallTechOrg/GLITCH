// store.ts: primitive actions, persistence under glitch.v1.state, hydration + state survival.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STATE_STORAGE_KEY, type PromptHistoryEntry } from '@/contracts/state';
import { LOAD_ERROR_TOAST, hydrateStore, resetHydrationForTests, resetStoreForTests, useGlitchStore } from '@/state/store';
import { resetToasts, useToastStore } from '@/ui/toast';

const entry = (id: string, hit = 5): PromptHistoryEntry => ({
  id, goalId: 'fw1', goal: 'Explain photosynthesis to a 10-year-old.', prompt: `prompt ${id}`,
  levers: { task: hit > 0, context: hit > 1, role: hit > 2, format: hit > 3, limit: hit > 4 }, leversHit: hit, passed: hit >= 4, source: 'demo', at: '2026-10-19T10:00:00.000Z',
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/**
 * Simulate an app reload: memory goes back to a fresh, un-hydrated store while the
 * "disk" keeps its bytes (or `disk` replaces them), then the layout's hydrateStore() runs.
 * (Every setState is persisted, so the stored bytes are restored after the memory reset.)
 */
async function coldStart(disk?: string): Promise<void> {
  const raw = disk ?? (await AsyncStorage.getItem(STATE_STORAGE_KEY));
  resetStoreForTests();
  resetHydrationForTests();
  await flush();
  if (raw !== null) await AsyncStorage.setItem(STATE_STORAGE_KEY, raw);
  else await AsyncStorage.removeItem(STATE_STORAGE_KEY);
  await hydrateStore();
}

const stored = async (): Promise<Record<string, unknown> | null> => {
  const raw = await AsyncStorage.getItem(STATE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
};

beforeEach(async () => {
  await AsyncStorage.clear();
  resetToasts();
  resetStoreForTests();
});

describe('useGlitchStore actions', () => {
  it('setNickname trims, caps at 20 and maps empty to null', () => {
    const s = useGlitchStore.getState();
    s.setNickname('  Ana  ');
    expect(useGlitchStore.getState().profile.nickname).toBe('Ana');
    s.setNickname('x'.repeat(25));
    expect(useGlitchStore.getState().profile.nickname).toHaveLength(20);
    s.setNickname('   ');
    expect(useGlitchStore.getState().profile.nickname).toBeNull();
  });

  it('setOnboarded and setReadableFont flip their flags', () => {
    useGlitchStore.getState().setOnboarded();
    useGlitchStore.getState().setReadableFont(true);
    expect(useGlitchStore.getState().profile.onboarded).toBe(true);
    expect(useGlitchStore.getState().settings.readableFont).toBe(true);
  });

  it('patch mutates a clone: callers cannot corrupt state they captured', () => {
    const before = useGlitchStore.getState().steps;
    useGlitchStore.getState().patch((d) => {
      d.xp += 30;
      d.steps.m1g1 = true;
      d.stars.m1g1 = 2;
    });
    const s = useGlitchStore.getState();
    expect(s.xp).toBe(30);
    expect(s.steps).toEqual({ m1g1: true });
    expect(before).toEqual({});
    expect(s.version).toBe(1);
  });

  it('addPromptHistory keeps newest first, caps at 50 and rejects malformed entries', () => {
    for (let i = 0; i < 55; i++) useGlitchStore.getState().addPromptHistory(entry(`h${i}`));
    const h = useGlitchStore.getState().promptHistory;
    expect(h).toHaveLength(50);
    expect(h[0]?.id).toBe('h54');
    useGlitchStore.getState().addPromptHistory({ ...entry('bad'), levers: {} as never });
    expect(useGlitchStore.getState().promptHistory[0]?.id).toBe('h54');
  });

  it('resetProgress keeps streak, nickname and settings, and clears everything else', () => {
    const s = useGlitchStore.getState();
    s.setNickname('Ana');
    s.setOnboarded();
    s.setReadableFont(true);
    s.addPromptHistory(entry('h1'));
    s.patch((d) => {
      d.xp = 245;
      d.streak = { current: 3, best: 5, lastPlayDay: '2026-10-19' };
      d.steps = { m1h: true, m1s: true };
      d.badges = { boot: '2026-10-19T00:00:00Z' };
      d.onceBonuses = { story1: true };
      d.lastHero = 'oracle';
    });
    useGlitchStore.getState().resetProgress();
    const r = useGlitchStore.getState();
    expect(r.xp).toBe(0);
    expect(r.steps).toEqual({});
    expect(r.badges).toEqual({});
    expect(r.onceBonuses).toEqual({});
    expect(r.promptHistory).toEqual([]);
    expect(r.lastHero).toBe('scout');
    expect(r.streak).toEqual({ current: 3, best: 5, lastPlayDay: '2026-10-19' });
    expect(r.profile).toMatchObject({ nickname: 'Ana', onboarded: true });
    expect(r.settings.readableFont).toBe(true);
  });
});

describe('persistence', () => {
  it('writes exactly the PersistedStateV1 shape under glitch.v1.state', async () => {
    useGlitchStore.getState().setNickname('Kai');
    await flush();
    const s = await stored();
    expect(s).toMatchObject({ version: 1, profile: { nickname: 'Kai' } });
    expect(Object.keys(s ?? {}).sort()).toEqual(
      ['badges', 'heroByModule', 'heroesPlayed', 'lastHero', 'onceBonuses', 'powersUsed', 'profile', 'promptHistory', 'settings', 'stars', 'steps', 'streak', 'version', 'xp'],
    );
  });

  it('state survives a reload: complete a step, reload, complete the next, reload — both present', async () => {
    useGlitchStore.getState().patch((d) => {
      d.steps.m1h = true;
    });
    await flush();
    expect((await stored())?.steps).toEqual({ m1h: true });
    await coldStart();
    expect(useGlitchStore.getState().steps).toEqual({ m1h: true });
    useGlitchStore.getState().patch((d) => {
      d.steps.m1s = true;
    });
    await flush();
    await coldStart();
    expect(useGlitchStore.getState().steps).toEqual({ m1h: true, m1s: true });
    expect(useGlitchStore.getState().hydrated).toBe(true);
  });

  it('corrupt saved progress → fresh state, hydrated, loadError set and the toast', async () => {
    await coldStart('{oops');
    const s = useGlitchStore.getState();
    expect(s.hydrated).toBe(true);
    expect(s.loadError).toMatch(/JSON/);
    expect(s.xp).toBe(0);
    expect(useToastStore.getState().current?.text).toBe(LOAD_ERROR_TOAST);
  });

  it('saved progress from a newer version → fresh state + toast (never a crash)', async () => {
    await coldStart(JSON.stringify({ version: 9, xp: 500 }));
    expect(useGlitchStore.getState()).toMatchObject({ hydrated: true, xp: 0 });
    expect(useGlitchStore.getState().loadError).toMatch(/newer/);
  });

  it('nothing stored → fresh state with no error and no toast', async () => {
    await AsyncStorage.clear();
    await coldStart();
    expect(useGlitchStore.getState()).toMatchObject({ hydrated: true, loadError: null });
    expect(useToastStore.getState().current).toBeNull();
  });
});
