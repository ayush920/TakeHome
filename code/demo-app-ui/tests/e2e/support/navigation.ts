import type { Page, Response } from '@playwright/test';

const NAVIGATION_ATTEMPTS = 3;
const NAVIGATION_RETRY_DELAY_MS = 1_000;
const TRANSIENT_NETWORK_ERROR = /net::ERR_CONNECTION_(RESET|CLOSED|REFUSED)|net::ERR_EMPTY_RESPONSE/;

/**
 * page.goto that retries when the connection itself is dropped. Docker Desktop's port forwarding
 * occasionally resets new connections under load (F-13); an HTTP error page is never retried.
 */
export async function navigate(page: Page, url: string): Promise<Response | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.goto(url);
    } catch (error) {
      const transient = TRANSIENT_NETWORK_ERROR.test((error as Error).message);
      if (!transient || attempt >= NAVIGATION_ATTEMPTS) throw error;
      await page.waitForTimeout(NAVIGATION_RETRY_DELAY_MS);
    }
  }
}