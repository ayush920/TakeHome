import { test as base } from '@playwright/test';
import { BffClient } from './clients/bff-client';
import { ClaimsServiceClient } from './clients/claims-service-client';
import { fetchAccessToken } from './clients/keycloak';
import { ACCOUNTS } from './config';

interface WorkerFixtures {
  /** Logged-in claimant session on the BFF. One login per worker, not per test. */
  claimantBff: BffClient;
  /** Logged-in admin session on the BFF. */
  adminBff: BffClient;
  /** claims-service called directly with a claimant's token (no BFF in between). */
  claimantOnClaimsService: ClaimsServiceClient;
  /** claims-service called directly with an admin's token. */
  adminOnClaimsService: ClaimsServiceClient;
}

interface TestFixtures {
  /** A BFF caller with no session. */
  anonymousBff: BffClient;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  claimantBff: [
    async ({ playwright }, use) => {
      const client = await BffClient.login(playwright, ACCOUNTS.claimant);
      await use(client);
      await client.dispose();
    },
    { scope: 'worker' },
  ],
  adminBff: [
    async ({ playwright }, use) => {
      const client = await BffClient.login(playwright, ACCOUNTS.admin);
      await use(client);
      await client.dispose();
    },
    { scope: 'worker' },
  ],
  claimantOnClaimsService: [
    async ({ playwright }, use) => {
      const token = await fetchAccessToken(playwright, ACCOUNTS.claimant);
      const client = await ClaimsServiceClient.withToken(playwright, token);
      await use(client);
      await client.dispose();
    },
    { scope: 'worker' },
  ],
  adminOnClaimsService: [
    async ({ playwright }, use) => {
      const token = await fetchAccessToken(playwright, ACCOUNTS.admin);
      const client = await ClaimsServiceClient.withToken(playwright, token);
      await use(client);
      await client.dispose();
    },
    { scope: 'worker' },
  ],
  anonymousBff: async ({ playwright }, use) => {
    const client = await BffClient.anonymous(playwright);
    await use(client);
    await client.dispose();
  },
});

export { expect } from '@playwright/test';
