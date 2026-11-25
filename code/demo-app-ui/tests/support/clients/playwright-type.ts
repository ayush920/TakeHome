import type { PlaywrightWorkerArgs } from '@playwright/test';

/** The `playwright` worker fixture's type (the package does not export it by name). */
export type Playwright = PlaywrightWorkerArgs['playwright'];
