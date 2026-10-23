// NO REAL NETWORK IN A UNIT TEST, and never to the estate's agents (ADR-0044: the browser talks only to reader-a2a,
// and a test talks to nothing). `fetch` is wrapped: localhost, the Bible API hosts and Typesense pass (tests stub
// those themselves when they matter); any other host is recorded, refused in words, and fails the test in
// `afterEach`. A fixture that mounts a fake agent on a host calls `allowHostForThisTest(host)`.
import { afterEach } from "vitest";

const ALLOWED = new Set([
  "127.0.0.1",
  "localhost",
  "scripture-api.faithnet.io",
  "bible.helloao.org",
  "vmfnri.helloao.org",
  "search.seedbible.org",
]);
const allowedForTest = new Set<string>();
const blocked: string[] = [];

const realFetch = globalThis.fetch;

function hostOf(input: RequestInfo | URL): string | null {
  try {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!/^https?:\/\//i.test(url)) return null; // a relative URL: no host, a page's own origin
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const blockedFetchMessage = (host: string) =>
  `blocked fetch to ${host} — the browser talks only to reader-a2a (ADR-0044); stub the backend`;

/** Let this one test reach `host` (a fake agent mounted in-process); cleared after the test. */
export function allowHostForThisTest(host: string) {
  allowedForTest.add(host.toLowerCase());
}

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const host = hostOf(input);
  if (host && !ALLOWED.has(host) && !allowedForTest.has(host)) {
    blocked.push(host);
    return Promise.reject(new Error(blockedFetchMessage(host)));
  }
  return realFetch(input, init);
}) as typeof fetch;

afterEach(() => {
  allowedForTest.clear();
  if (blocked.length) {
    const hosts = [...new Set(blocked.splice(0))];
    throw new Error(
      `a test fetched a real host: ${hosts.join(", ")} — the browser talks only to reader-a2a (ADR-0044); stub the backend`
    );
  }
});
