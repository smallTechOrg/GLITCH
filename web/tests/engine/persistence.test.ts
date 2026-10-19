// State survives a full reload (course-shell.md success criterion): complete a step through
// the shell actions, reload from device storage, complete the next, reload, both present.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STATE_STORAGE_KEY } from '@/contracts/state';
import { chooseHero, completeOnboarding, finishStory, runDaily, winGame } from '@/state/actions';
import { hydrateStore, resetHydrationForTests, resetStoreForTests, useGlitchStore } from '@/state/store';
import { resetToasts } from '@/ui/toast';

const NOW = new Date(2026, 9, 20, 10);

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

/** Simulate a page reload: memory → blank un-hydrated store, disk keeps its bytes, then hydrate. */
async function reload(): Promise<void> {
  await flush();
  const raw = await AsyncStorage.getItem(STATE_STORAGE_KEY);
  resetStoreForTests({}, NOW); // (persisted too — the saved bytes are restored below)
  resetHydrationForTests();
  await flush();
  if (raw !== null) await AsyncStorage.setItem(STATE_STORAGE_KEY, raw);
  await hydrateStore();
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetToasts();
  resetStoreForTests({}, NOW);
});
afterEach(() => resetToasts());

describe('progress persistence', () => {
  it('two interactions across two reloads both survive', async () => {
    completeOnboarding('Ada');
    runDaily(NOW);
    chooseHero(1, 'oracle', NOW);
    await reload();
    expect(useGlitchStore.getState().steps.m1h).toBe(true);
    expect(useGlitchStore.getState().profile.nickname).toBe('Ada');
    finishStory(1, NOW);
    await reload();
    const s = useGlitchStore.getState();
    expect(s.steps).toEqual({ m1h: true, m1s: true });
    expect(s.heroByModule[1]).toBe('oracle');
    expect(s.xp).toBe(20);
    expect(s.streak).toEqual({ current: 1, best: 1, lastPlayDay: '2026-10-20' });
    const raw = JSON.parse((await AsyncStorage.getItem(STATE_STORAGE_KEY)) ?? '{}') as { version?: number };
    expect(raw.version).toBe(1);
  });

  it('a win (stars, once-bonus, badges) survives a reload, and a replay after reload grants no game XP', async () => {
    completeOnboarding(null);
    chooseHero(1, 'scout', NOW);
    finishStory(1, NOW);
    const first = winGame('m1g1', 3, 0, NOW);
    expect(first.gameXp).toBe(30);
    await reload();
    expect(useGlitchStore.getState().stars.m1g1).toBe(3);
    expect(useGlitchStore.getState().badges.untouch).toBeDefined();
    const again = winGame('m1g1', 1, 2, NOW);
    expect(again.gameXp).toBe(0);
    expect(useGlitchStore.getState().stars.m1g1).toBe(3);
  });
});
