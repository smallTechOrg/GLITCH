// Runs after Playwright's webServers are up: the backend must report the provider under test.
import { API_URL, EXPECTED_PROVIDER } from './fixtures';

export default async function globalSetup(): Promise<void> {
  let body: unknown;
  try {
    const res = await fetch(`${API_URL}/healthz`);
    body = await res.json();
  } catch (e) {
    throw new Error(`E2E setup: backend not reachable at ${API_URL}/healthz (${String(e)}). Start it with: cd api && uv run python -m glitch_api`);
  }
  const provider = (body as { data?: { provider?: string } })?.data?.provider;
  if (provider !== EXPECTED_PROVIDER) {
    throw new Error(
      `E2E setup: /healthz reports provider "${String(provider)}" but GLITCH_E2E_EXPECT_PROVIDER="${EXPECTED_PROVIDER}". ` +
        (EXPECTED_PROVIDER === 'openrouter' ? 'Add GLITCH_OPENROUTER_API_KEY to the repo-root .env (PENDING-KEY).' : 'Check GLITCH_LLM_PROVIDER.'),
    );
  }
}
