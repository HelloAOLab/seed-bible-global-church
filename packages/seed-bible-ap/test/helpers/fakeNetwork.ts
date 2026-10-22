// THE FAKE NETWORK — `fetch` routed by host to an in-process Hono app (or a handler), on top of the blocker in
// test/setup/blockRealFetch.ts: a routed host is answered here, every other host still goes to the blocker and
// fails the test. Install in a test, `vi.unstubAllGlobals()` in its afterEach.
import { vi } from "vitest";
import type { Hono } from "hono";
import { allowHostForThisTest } from "../setup/blockRealFetch";

export type HostHandler =
  | Hono
  | ((request: Request) => Promise<Response> | Response);

export interface FakeNetwork {
  /** Every request a routed host answered, in order. */
  requests: Array<{ host: string; method: string; path: string }>;
}

export function installFakeNetwork(
  routes: Record<string, HostHandler>
): FakeNetwork {
  const previous = globalThis.fetch;
  const requests: FakeNetwork["requests"] = [];
  for (const host of Object.keys(routes)) allowHostForThisTest(host);
  vi.stubGlobal("fetch", (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const request = input instanceof Request ? input : new Request(input, init);
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return previous(input, init);
    }
    const handler = routes[url.hostname.toLowerCase()];
    if (!handler) return previous(input, init);
    requests.push({
      host: url.hostname,
      method: request.method,
      path: url.pathname + url.search,
    });
    return typeof handler === "function"
      ? handler(request)
      : handler.request(request);
  }) as typeof fetch);
  return { requests };
}
