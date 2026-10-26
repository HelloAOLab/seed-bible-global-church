// The publishing gateway (publishing.faithnet.io, Source Publishing) — by service binding when deployed (its routes without
// the site's `/api`), by its public API in dev.
export interface PublishingEnv {
  PUBLISHING?: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  /** Its public API when there is no binding (dev). */
  PUBLISHING_URL?: string;
  /** The map work the places map draws on, by publisher handle and slug (defaults: the Bible lands base map). */
  MAP_HANDLE?: string;
  MAP_SLUG?: string;
}

export function publishingFetch(
  env: PublishingEnv,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return env.PUBLISHING
    ? env.PUBLISHING.fetch(`https://publishing${path}`, init)
    : fetch(
        `${(env.PUBLISHING_URL ?? "https://publishing.faithnet.io/api").replace(/\/$/, "")}${path}`,
        init
      );
}
