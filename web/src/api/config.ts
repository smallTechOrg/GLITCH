// Build-time API base URL. `process.env.EXPO_PUBLIC_*` must be referenced literally so the
// Expo export inlines it (spec/architecture.md → Configuration).
export const DEFAULT_API_URL = 'http://127.0.0.1:8787';

export function normalizeBaseUrl(v: string | undefined | null): string {
  const s = (v ?? '').trim();
  return (s || DEFAULT_API_URL).replace(/\/+$/, '');
}

export const API_BASE_URL: string = normalizeBaseUrl(process.env.EXPO_PUBLIC_GLITCH_API_URL);
export const DEVICE_HEADER = 'X-Glitch-Device';
