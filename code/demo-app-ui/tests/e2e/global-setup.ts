import { STACK } from '../support/config';

const STARTUP_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

/** The UI container runs the Next.js dev server, which compiles each route on first visit (tens of seconds). */
const UI_ROUTES_TO_WARM = ['/login', '/claims', '/claims/new', '/admin/claims', '/admin/dashboard'];
const WARM_UP_TIMEOUT_MS = 90_000;

const REQUIRED_ENDPOINTS: ReadonlyArray<{ name: string; url: string }> = [
  { name: 'claims-service', url: `${STACK.claimsServiceUrl}/actuator/health` },
  { name: 'bff-service', url: `${STACK.bffUrl}/actuator/health` },
  { name: 'ui', url: STACK.uiUrl },
];

async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Fails fast with a readable message when the Docker Compose stack is not running, instead of every
 * test timing out separately. (This file was referenced by playwright.config.ts but missing: F-09.)
 */
export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  const pending = new Set(REQUIRED_ENDPOINTS.map((endpoint) => endpoint.name));

  while (pending.size > 0 && Date.now() < deadline) {
    for (const endpoint of REQUIRED_ENDPOINTS) {
      if (pending.has(endpoint.name) && (await isUp(endpoint.url))) pending.delete(endpoint.name);
    }
    if (pending.size > 0) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (pending.size > 0) {
    throw new Error(
      `Stack is not ready: ${[...pending].join(', ')}. Start it first (see README: docker compose up).`,
    );
  }

  await warmUpUiRoutes();
}

/** Best effort: a failed warm-up must not fail the run, the tests will surface any real problem. */
async function warmUpUiRoutes(): Promise<void> {
  await Promise.all(
    UI_ROUTES_TO_WARM.map((route) =>
      fetch(`${STACK.uiUrl}${route}`, { redirect: 'manual', signal: AbortSignal.timeout(WARM_UP_TIMEOUT_MS) }).catch(
        () => undefined,
      ),
    ),
  );
}
