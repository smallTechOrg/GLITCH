// Runs after Playwright's webServers are up:
//  1. the served export must have been built against THIS run's API port (the API URL is baked
//     into the bundle at export time) — otherwise the browser would talk to another backend;
//  2. the backend must report the provider under test.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_URL, E2E_API_PORT, EXPECTED_PROVIDER, WEB_DIST, WEB_DIST_ENV } from './config';

function jsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
}

/** Throws unless some exported JS bundle contains the E2E API URL. */
export function assertExportTargetsApi(distDir: string = WEB_DIST, apiUrl: string = API_URL): void {
  const exportCmd =
    `cd web && EXPO_PUBLIC_GLITCH_API_URL=${apiUrl} npx expo export --platform web` +
    (WEB_DIST_ENV === 'dist' ? '' : ` --output-dir ${WEB_DIST_ENV}`);
  const bundles = jsFiles(join(distDir, '_expo'));
  if (bundles.length === 0) throw new Error(`E2E setup: no exported JS under ${distDir}/_expo. Run: ${exportCmd}`);
  const found = bundles.some((f) => readFileSync(f, 'utf8').includes(apiUrl));
  if (!found) {
    throw new Error(
      `E2E setup: the export in ${distDir} was not built for the E2E API ${apiUrl} (GLITCH_E2E_API_PORT=${E2E_API_PORT}). ` +
        `EXPO_PUBLIC_GLITCH_API_URL is baked at export time. Re-export first: ${exportCmd}`,
    );
  }
}

export default async function globalSetup(): Promise<void> {
  assertExportTargetsApi();
  let body: unknown;
  try {
    const res = await fetch(`${API_URL}/healthz`);
    body = await res.json();
  } catch (e) {
    throw new Error(`E2E setup: backend not reachable at ${API_URL}/healthz (${String(e)}). Start it with: cd api && GLITCH_PORT=${E2E_API_PORT} uv run python -m glitch_api`);
  }
  const provider = (body as { data?: { provider?: string } })?.data?.provider;
  if (provider !== EXPECTED_PROVIDER) {
    throw new Error(
      `E2E setup: /healthz reports provider "${String(provider)}" but GLITCH_E2E_EXPECT_PROVIDER="${EXPECTED_PROVIDER}". ` +
        (EXPECTED_PROVIDER === 'openrouter' ? 'Add GLITCH_OPENROUTER_API_KEY to the repo-root .env (PENDING-KEY).' : 'Check GLITCH_LLM_PROVIDER.'),
    );
  }
}
