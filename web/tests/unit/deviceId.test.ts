// deviceId.ts: anonymous UUID v4 created once, persisted, reused; invalid stored ids replaced.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEVICE_STORAGE_KEY } from '@/contracts/state';
import { getDeviceId, isUuidV4, newUuidV4, resetDeviceIdCache } from '@/state/deviceId';
import { resetStoreForTests, useGlitchStore } from '@/state/store';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetDeviceIdCache();
});

describe('device id', () => {
  it('generates RFC 4122 v4 ids', () => {
    for (let i = 0; i < 20; i++) expect(isUuidV4(newUuidV4())).toBe(true);
    expect(isUuidV4('not-a-uuid')).toBe(false);
    expect(isUuidV4('123e4567-e89b-12d3-a456-426614174000')).toBe(false); // v1
  });

  it('creates and stores an id on first call and returns the same id afterwards', async () => {
    const a = await getDeviceId();
    expect(isUuidV4(a)).toBe(true);
    expect(await AsyncStorage.getItem(DEVICE_STORAGE_KEY)).toBe(a);
    resetDeviceIdCache();
    expect(await getDeviceId()).toBe(a);
  });

  it('replaces a corrupt stored id', async () => {
    await AsyncStorage.setItem(DEVICE_STORAGE_KEY, 'garbage');
    const id = await getDeviceId();
    expect(id).not.toBe('garbage');
    expect(isUuidV4(id)).toBe(true);
  });

  it('is not touched by Reset progress', async () => {
    const id = await getDeviceId();
    resetStoreForTests();
    useGlitchStore.getState().resetProgress();
    expect(await AsyncStorage.getItem(DEVICE_STORAGE_KEY)).toBe(id);
  });
});
