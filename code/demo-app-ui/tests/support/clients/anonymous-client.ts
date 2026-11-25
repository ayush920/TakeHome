import type { APIRequestContext } from '@playwright/test';
import type { Playwright } from './playwright-type';
import { BaseHttpClient } from './http-client';

/** A caller that presents no credentials at all, against any service base URL. */
export class AnonymousClient extends BaseHttpClient {
  private constructor(context: APIRequestContext) {
    super(context);
  }

  static async forService(playwright: Playwright, baseUrl: string): Promise<AnonymousClient> {
    return new AnonymousClient(await playwright.request.newContext({ baseURL: baseUrl }));
  }

  protected async headersFor(): Promise<Record<string, string>> {
    return {};
  }
}
