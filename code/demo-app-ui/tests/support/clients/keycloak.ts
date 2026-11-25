import type { Playwright } from './playwright-type';
import { STACK, type Credentials } from '../config';
import { TRANSPORT_RETRIES } from './http-client';

const TOKEN_ATTEMPTS = 3;
const TOKEN_RETRY_DELAY_MS = 1_500;

/**
 * Obtains a raw access token the same way the BFF does (password grant), so tests can call
 * claims-service directly and prove what it does when nobody sits in front of it.
 *
 * Retries a few times: Keycloak occasionally answers a valid grant with an error while the small
 * Docker VM is saturated (assessment finding F-13). Only the token fetch retries, never the app calls.
 */
export async function fetchAccessToken(
  playwright: Playwright,
  credentials: Credentials,
): Promise<string> {
  const context = await playwright.request.newContext();
  try {
    let lastStatus = 0;
    for (let attempt = 1; attempt <= TOKEN_ATTEMPTS; attempt++) {
      const response = await context.post(STACK.keycloakTokenUrl, {
        maxRetries: TRANSPORT_RETRIES,
        form: {
          grant_type: 'password',
          client_id: STACK.keycloakClientId,
          username: credentials.email,
          password: credentials.password,
        },
      });
      if (response.ok()) return ((await response.json()) as { access_token: string }).access_token;
      lastStatus = response.status();
      await new Promise((resolve) => setTimeout(resolve, TOKEN_RETRY_DELAY_MS));
    }
    throw new Error(`Keycloak token request failed for ${credentials.email}: ${lastStatus}`);
  } finally {
    await context.dispose();
  }
}
