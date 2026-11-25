import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test as apiTest } from '../../support/fixtures';
import type { BffClient } from '../../support/clients/bff-client';
import { STACK } from '../../support/config';

const AUTH_STORAGE_KEY = 'auth-storage';

/**
 * Opens a browser already signed in as the given session. The BFF login cookies are copied over and
 * the UI's persisted auth state is seeded, exactly what a completed login leaves behind, so journey
 * tests do not each pay for a full login. The login screen itself has its own test.
 */
async function signedInContext(browser: Browser, session: BffClient): Promise<BrowserContext> {
  const { userId, email, name, role } = session.profile;
  return browser.newContext({
    baseURL: STACK.uiUrl,
    storageState: {
      cookies: await session.sessionCookies(),
      origins: [
        {
          origin: STACK.uiUrl,
          localStorage: [
            {
              name: AUTH_STORAGE_KEY,
              value: JSON.stringify({ state: { user: { userId, email, name, role }, isAuthenticated: true }, version: 0 }),
            },
          ],
        },
      ],
    },
  });
}

interface BrowserFixtures {
  claimantPage: Page;
  adminPage: Page;
}

export const test = apiTest.extend<BrowserFixtures>({
  claimantPage: async ({ browser, claimantBff }, use) => {
    const context = await signedInContext(browser, claimantBff);
    await use(await context.newPage());
    await context.close();
  },
  adminPage: async ({ browser, adminBff }, use) => {
    const context = await signedInContext(browser, adminBff);
    await use(await context.newPage());
    await context.close();
  },
});

export { expect } from '@playwright/test';