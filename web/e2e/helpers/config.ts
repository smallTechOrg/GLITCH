// Single source of truth for the E2E stack's ports, URLs and export dir. Imported by
// playwright.config.ts (webServers), fixtures.ts (apiUrl) and globalSetup.ts (guards), so no
// spec ever hardcodes a port.
//
//   GLITCH_E2E_API_PORT  API port the E2E backend binds (default 8787)
//   GLITCH_WEB_PORT      static export server port (default 8090)
//   GLITCH_WEB_DIST      export dir served, relative to web/ or absolute (default `dist`)
//   GLITCH_E2E_EXPECT_PROVIDER  `fake` (default) | `openrouter`
//
// The export bakes EXPO_PUBLIC_GLITCH_API_URL at build time, so it must be built against the
// same API port first, e.g.
//   cd web && EXPO_PUBLIC_GLITCH_API_URL=http://127.0.0.1:8788 npx expo export --platform web --output-dir dist-e2e
//   cd web && GLITCH_WEB_DIST=dist-e2e GLITCH_E2E_API_PORT=8788 GLITCH_WEB_PORT=8091 GLITCH_E2E_EXPECT_PROVIDER=fake npx playwright test
// globalSetup fails loudly when the baked URL does not match.
import { isAbsolute, resolve } from 'node:path';

function port(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`E2E config: ${name}="${raw}" is not a valid port`);
  return n;
}

export const E2E_API_PORT = port('GLITCH_E2E_API_PORT', 8787);
export const E2E_WEB_PORT = port('GLITCH_WEB_PORT', 8090);
export const E2E_HOST = '127.0.0.1';
export const API_URL = `http://${E2E_HOST}:${E2E_API_PORT}`;
export const WEB_ORIGIN = `http://${E2E_HOST}:${E2E_WEB_PORT}`;
export const WEB_URL = `${WEB_ORIGIN}/GLITCH/`;
export const EXPECTED_PROVIDER = process.env.GLITCH_E2E_EXPECT_PROVIDER ?? 'fake';

const WEB_ROOT = resolve(__dirname, '..', '..');
const distEnv = process.env.GLITCH_WEB_DIST || 'dist';
export const WEB_DIST = isAbsolute(distEnv) ? distEnv : resolve(WEB_ROOT, distEnv);
export const WEB_DIST_ENV = distEnv;

/** Only reuse an already-running server when explicitly asked (never silently test someone else's). */
export const REUSE_SERVERS = process.env.GLITCH_E2E_REUSE_SERVERS === '1';
