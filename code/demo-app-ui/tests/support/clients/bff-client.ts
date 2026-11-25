import type { APIRequestContext } from '@playwright/test';
import type { Playwright } from './playwright-type';
import { CSRF, ENDPOINTS, STACK, type Credentials } from '../config';
import { BaseHttpClient } from './http-client';

const LOGIN_ATTEMPTS = 3;
const LOGIN_RETRY_DELAY_MS = 1_500;

/**
 * Cookie-session client for the BFF, behaving like the browser UI: it logs in, keeps the HttpOnly
 * cookies, and echoes the CSRF cookie back as a header on state-changing calls.
 */
export class BffClient extends BaseHttpClient {
  private constructor(
    context: APIRequestContext,
    readonly userId: string,
  ) {
    super(context);
  }

  /**
   * Login retries a few times because Keycloak occasionally times out on a resource-starved Docker
   * VM (assessment finding F-13). Retrying is limited to login so real API failures are never masked.
   */
  static async login(playwright: Playwright, credentials: Credentials): Promise<BffClient> {
    const context = await playwright.request.newContext({ baseURL: STACK.bffUrl });
    let lastStatus = 0;
    for (let attempt = 1; attempt <= LOGIN_ATTEMPTS; attempt++) {
      const response = await context.post(ENDPOINTS.login, {
        data: { email: credentials.email, password: credentials.password },
      });
      lastStatus = response.status();
      if (response.ok()) {
        const { userId } = (await response.json()) as { userId: string };
        await context.get(ENDPOINTS.csrf);
        return new BffClient(context, userId);
      }
      if (attempt < LOGIN_ATTEMPTS) await new Promise((r) => setTimeout(r, LOGIN_RETRY_DELAY_MS));
    }
    await context.dispose();
    throw new Error(`BFF login failed for ${credentials.email}: HTTP ${lastStatus}`);
  }

  /** A client with no session at all, for "unauthenticated caller" scenarios. */
  static async anonymous(playwright: Playwright): Promise<BffClient> {
    return new BffClient(await playwright.request.newContext({ baseURL: STACK.bffUrl }), '');
  }

  protected async headersFor(method: 'GET' | 'POST' | 'PATCH'): Promise<Record<string, string>> {
    if (method === 'GET') return {};
    const { cookies } = await this.context.storageState();
    const token = cookies.find((cookie) => cookie.name === CSRF.cookieName)?.value;
    return token ? { [CSRF.headerName]: token } : {};
  }

  /** Same call, deliberately without the CSRF header. */
  async postWithoutCsrf(path: string, body?: unknown) {
    return this.context.post(path, { data: body });
  }
}
