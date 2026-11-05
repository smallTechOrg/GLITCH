// Anonymous device id (spec/data.md → Device id): random UUID v4 created on first launch,
// stored under `glitch.v1.device`, never reset by Reset progress, sent only as X-Glitch-Device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { DEVICE_STORAGE_KEY } from '../contracts/state';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuidV4 = (v: unknown): v is string => typeof v === 'string' && UUID_V4.test(v);

function fallbackUuid(): string {
  const b = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newUuidV4(): string {
  try {
    const id = Crypto.randomUUID();
    if (isUuidV4(id)) return id.toLowerCase();
  } catch {
    // native module unavailable (tests / old runtime) → fallback below
  }
  return fallbackUuid();
}

let pending: Promise<string> | null = null;

async function load(): Promise<string> {
  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(DEVICE_STORAGE_KEY);
  } catch {
    stored = null;
  }
  if (isUuidV4(stored)) return stored;
  const id = newUuidV4();
  try {
    await AsyncStorage.setItem(DEVICE_STORAGE_KEY, id);
  } catch {
    // storage full/blocked: id still works for this session
  }
  return id;
}

/** The device id (created + persisted on first call; memoised). Never rejects. */
export function getDeviceId(): Promise<string> {
  if (!pending) pending = load();
  return pending;
}

/** Tests only. */
export function resetDeviceIdCache(): void {
  pending = null;
}
