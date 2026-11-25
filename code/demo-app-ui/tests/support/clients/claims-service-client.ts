import type { APIRequestContext } from '@playwright/test';
import type { Playwright } from './playwright-type';
import { STACK } from '../config';
import { BaseHttpClient } from './http-client';

/**
 * Bearer-token client for claims-service, bypassing the BFF. Used to verify the service enforces
 * its own authorization instead of relying on the BFF being in front of it.
 */
export class ClaimsServiceClient extends BaseHttpClient {
  private constructor(
    context: APIRequestContext,
    private readonly bearerToken: string,
  ) {
    super(context);
  }

  static async withToken(playwright: Playwright, accessToken: string): Promise<ClaimsServiceClient> {
    const context = await playwright.request.newContext({ baseURL: STACK.claimsServiceUrl });
    return new ClaimsServiceClient(context, accessToken);
  }

  protected async headersFor(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${this.bearerToken}` };
  }
}
