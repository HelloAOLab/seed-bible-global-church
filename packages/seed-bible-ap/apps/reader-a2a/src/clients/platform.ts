// seed-bible.svc, the serving plane — by service binding when deployed (same-account workers.dev fetches 1042), by URL in dev.
export interface PlatformEnv {
  /** The shared secret the serving plane requires to put a file (mirrors its UPLOAD_TOKEN). */
  PLATFORM_UPLOAD_TOKEN?: string;
  PLATFORM?: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  PLATFORM_URL?: string;
}
/** Any request to the serving plane (uploads): the binding when deployed, the URL in dev. */
export async function platformSend(
  env: PlatformEnv,
  path: string,
  init: RequestInit
): Promise<Response> {
  return env.PLATFORM
    ? env.PLATFORM.fetch(`https://platform${path}`, init)
    : fetch(
        `${(env.PLATFORM_URL ?? "http://127.0.0.1:8892").replace(/\/$/, "")}${path}`,
        init
      );
}

export async function platformGet<T>(
  env: PlatformEnv,
  path: string
): Promise<T> {
  const res = env.PLATFORM
    ? await env.PLATFORM.fetch(`https://platform${path}`)
    : await fetch(
        `${(env.PLATFORM_URL ?? "http://127.0.0.1:8892").replace(/\/$/, "")}${path}`
      );
  const out = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !out)
    throw new Error(`seed-bible.svc answered ${res.status} for ${path}`);
  return out;
}
