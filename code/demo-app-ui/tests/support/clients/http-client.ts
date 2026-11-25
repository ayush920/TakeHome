import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Playwright retries only connection resets (ECONNRESET), never HTTP error statuses, so this absorbs
 * transient transport drops on the small Docker VM without hiding real application failures.
 */
export const TRANSPORT_RETRIES = 3;

/** Minimal verb surface shared by both service clients, so tests read the same against either. */
export interface HttpClient {
  get(path: string): Promise<APIResponse>;
  post(path: string, body?: unknown): Promise<APIResponse>;
  patch(path: string, body?: unknown): Promise<APIResponse>;
}

/**
 * Wraps an APIRequestContext and lets a subclass decide which extra headers each verb carries
 * (CSRF for the BFF, nothing extra for a bearer-authenticated service).
 */
export abstract class BaseHttpClient implements HttpClient {
  protected constructor(protected readonly context: APIRequestContext) {}

  protected abstract headersFor(method: 'GET' | 'POST' | 'PATCH'): Promise<Record<string, string>>;

  async get(path: string): Promise<APIResponse> {
    return this.context.get(path, { maxRetries: TRANSPORT_RETRIES, headers: await this.headersFor('GET') });
  }

  async post(path: string, body?: unknown): Promise<APIResponse> {
    return this.context.post(path, { data: body, maxRetries: TRANSPORT_RETRIES, headers: await this.headersFor('POST') });
  }

  async patch(path: string, body?: unknown): Promise<APIResponse> {
    return this.context.patch(path, { data: body, maxRetries: TRANSPORT_RETRIES, headers: await this.headersFor('PATCH') });
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }
}
