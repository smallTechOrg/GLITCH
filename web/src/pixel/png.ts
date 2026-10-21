// Framebuffer → PNG (fast-png) → data URI, memoised by key (v3 `mkImg` cache, line 147).
import { encode } from 'fast-png';
import type { FrameBuffer } from '../contracts/art';
import { scaleUp } from './framebuffer';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Platform-independent base64 (no btoa/Buffer dependency). */
export function base64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63) + B64.charAt((n >> 6) & 63) + B64.charAt(n & 63);
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63) + '==';
  } else if (rem === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63) + B64.charAt((n >> 6) & 63) + '=';
  }
  return out;
}

export function encodePng(fb: FrameBuffer): Uint8Array {
  return encode({
    width: fb.w,
    height: fb.h,
    data: new Uint8Array(fb.data.buffer, fb.data.byteOffset, fb.data.byteLength),
    channels: 4,
    depth: 8,
  });
}

export function toDataUri(fb: FrameBuffer): string {
  return `data:image/png;base64,${base64(encodePng(fb))}`;
}

export interface PixelAsset {
  uri: string;
  w: number; // source pixel size (before any pre-upscale)
  h: number;
  scale: number; // integer pre-upscale baked into the PNG
}

const cache = new Map<string, PixelAsset>();
let builds = 0;

/**
 * Memoised PNG data URI. `build` runs at most once per (key, scale).
 * `scale` > 1 bakes a nearest-neighbour upscale into the PNG (native path).
 */
export function pixelAsset(key: string, build: () => FrameBuffer, scale = 1): PixelAsset {
  const s = Math.max(1, Math.floor(scale));
  const k = `${key}@${s}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const fb = build();
  builds++;
  const asset: PixelAsset = { uri: toDataUri(s > 1 ? scaleUp(fb, s) : fb), w: fb.w, h: fb.h, scale: s };
  cache.set(k, asset);
  return asset;
}

/** Test helpers. */
export const pixelCacheStats = (): { size: number; builds: number } => ({ size: cache.size, builds });
export function clearPixelCache(): void {
  cache.clear();
  builds = 0;
}
