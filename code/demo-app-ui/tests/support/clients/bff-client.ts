import type { APIRequestContext } from '@playwright/test';
import type { Playwright } from './playwright-type';
import { CSRF, ENDPOINTS, STACK, type Credentials } from '../config';
import { BaseHttpClient, TRANSPORT_RETRIES } from './http-client';

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  role: string;
}

const NO_SESSION: UserProfile = { userId: '', email: '', name: '', role: '' };
const LOGIN_ATTEMPTS = 3;
const LOGIN_RETRY_DELAY_MS = 1_500;

/**
 * Cookie-session client for the BFF, behaving like the browser UI: it logs in, keeps the HttpOnly
 * cookies, and echoes the CSRF cookie back as a header on state-changing calls.
 */
export class BffClient extends BaseHttpClient {
  private constructor(
    context: APIRequestContext,
    readonly profile: UserProfile,
  ) {
    super(context);
  }

  get userId(): string {
    return this.profile.userId;
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
        maxRetries: TRANSPORT_RETRIES,
        data: { email: credentials.email, password: credentials.password },
      });
      lastStatus = response.status();
      if (response.ok()) {
        const profile = (await response.json()) as UserProfile;
        await context.get(ENDPOINTS.csrf);
        return new BffClient(context, profile);
      }
      if (attempt < LOGIN_ATTEMPTS) await new Promise((r) => setTimeout(r, LOGIN_RETRY_DELAY_MS));
    }
    await context.dispose();
    throw new Error(`BFF login failed for ${credentials.email}: HTTP ${lastStatus}`);
  }

  /** A client with no session at all, for "unauthenticated caller" scenarios. */
  static async anonymous(playwright: Playwright): Promise<BffClient> {
    return new BffClient(await playwright.request.newContext({ baseURL: STACK.bffUrl }), NO_SESSION);
  }

  protected async headersFor(method: 'GET' | 'POST' | 'PATCH'): Promise<Record<string, string>> {
    if (method === 'GET') return {};
    const { cookies } = await this.context.storageState();
    const token = cookies.find((cookie) => cookie.name === CSRF.cookieName)?.value;
    return token ? { [CSRF.headerName]: token } : {};
  }

  /** The session cookies, so a browser context can start already signed in. */
  async sessionCookies() {
    return (await this.context.storageState()).cookies;
  }

  /** Same call, deliberately without the CSRF header. */
  async postWithoutCsrf(path: string, body?: unknown) {
    return this.context.post(path, { data: body });
  }
}
