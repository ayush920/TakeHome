import { vi } from 'vitest';

/** Network boundary for component tests: the real stores and generated API client run, only fetch is faked. */

export type Handler = (request: { url: URL; init: RequestInit }) => Response | Promise<Response>;

export const jsonResponse = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A network failure, as the browser reports it when the server is unreachable. */
export const networkFailure = (): Handler => () => {
  throw new TypeError('Failed to fetch');
};

export interface FakeBff {
  /** Requests received for a "METHOD /path" key, in order. */
  callsTo(routeKey: string): Array<{ url: URL; init: RequestInit }>;
  /** Replace the handler for a route mid-test (for example, make a retry succeed). */
  respondWith(routeKey: string, handler: Handler): void;
}

/**
 * Routes are keyed "METHOD /path". A request with no matching route fails the test loudly, so a
 * component cannot silently call an endpoint the test did not expect.
 */
export function stubBff(routes: Record<string, Handler>): FakeBff {
  const handlers = new Map(Object.entries(routes));
  const calls = new Map<string, Array<{ url: URL; init: RequestInit }>>();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, 'http://localhost');
      const key = `${(init.method ?? 'GET').toUpperCase()} ${url.pathname}`;
      const handler = handlers.get(key);
      if (!handler) throw new Error(`Unexpected request in component test: ${key}`);
      calls.set(key, [...(calls.get(key) ?? []), { url, init }]);
      return handler({ url, init });
    }),
  );

  return {
    callsTo: (routeKey) => calls.get(routeKey) ?? [],
    respondWith: (routeKey, handler) => void handlers.set(routeKey, handler),
  };
}
