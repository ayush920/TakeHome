import { defineConfig, devices } from '@playwright/test';
import { STACK } from './tests/support/config';

const E2E_EXPECT_TIMEOUT_MS = 30_000;
const E2E_RETRIES = 1;

/**
 * The suite targets the already-running Docker Compose stack; it does not start its own server.
 *   api   - black-box HTTP tests against the BFF and claims-service (no browser)
 *   e2e   - browser journeys through the real UI
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The Docker VM is small; keep parallelism low so load does not cause false failures.
  workers: process.env.CI ? 1 : 2,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
  ],
  use: {
    baseURL: STACK.uiUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  projects: [
    { name: 'api', testDir: './tests/api', testMatch: '**/*.api.spec.ts' },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      testMatch: '**/*.e2e.spec.ts',
      // Pages load data through Keycloak-validated calls that can stall for several seconds on the small
      // Docker VM (F-13), so browser assertions wait longer and one retry absorbs a single stall.
      expect: { timeout: E2E_EXPECT_TIMEOUT_MS },
      retries: E2E_RETRIES,
      use: { ...devices['Desktop Chrome'], channel: process.env.QA_BROWSER_CHANNEL ?? 'chrome' },
    },
  ],
});
