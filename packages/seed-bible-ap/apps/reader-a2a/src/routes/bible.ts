// THE BIBLE, ASKED OF THE SCRIPTURE AGENT OVER A2A. The reader reads Scripture in the Free Use Bible API's shapes; the
// scripture agent (scripture-resolver.svc, scripture.faithnet.io) holds a received copy with every verse committed and
// answers it as A2A skills (list-translations, read-chapter, …). Here each path the reader asks (`/bible/api/...`, the
// API's own paths under this origin) becomes one standard A2A SendMessage to that agent — a data part `{ skill, args }`
// — and its reply's data part is handed back, its links moved under `/bible/`. Agent to agent: the browser talks only to
// this origin. Nothing is decided here about the text: the verse commitments, proofs and the agent's signed attestation
// pass through unchanged, and the reader checks them on the device (lib/scripture/verify.ts), so this hop cannot vouch
// for a word it altered. Answers are kept at the edge (a chapter a day; the catalogue five minutes).
import { Hono, type Context } from "hono";
import {
  createStandardA2aClient,
  type PartV1,
} from "@agenticprimitives/a2a/standard";

export interface BibleEnv {
  /** The scripture agent over a service binding (a same-account Worker cannot fetch another by its public URL). */
  SCRIPTURE?: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  };
  /** Its A2A endpoint (the card's JSON-RPC interface). */
  SCRIPTURE_A2A_URL?: string;
}

const DEFAULT_ENDPOINT = "https://scripture.faithnet.io/api/a2a";
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A refusal the agent gave (a translation it does not hold, a bad argument): the reader is told 404, with its words. */
class Refused extends Error {}

export async function askScripture(
  env: BibleEnv,
  skill: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const binding = env.SCRIPTURE;
  const client = createStandardA2aClient({
    endpoint: env.SCRIPTURE_A2A_URL ?? DEFAULT_ENDPOINT,
    ...(binding
      ? { fetch: ((input, init) => binding.fetch(input, init)) as typeof fetch }
      : {}),
  });
  const out = await client.sendMessage([
    { data: { skill, args }, mediaType: "application/json" },
  ]);
  const parts: PartV1[] =
    out.message?.parts ?? out.task?.status?.message?.parts ?? [];
  const data = parts.find((p) => p.data !== undefined)?.data;
  if (data !== undefined) return data;
  const words = parts
    .map((p) => p.text ?? "")
    .join(" ")
    .trim();
  const state = out.task?.status?.state ?? "";
  if (/REJECTED/.test(state)) throw new Refused(words || `${skill} refused`);
  throw new Error(
    words ||
      `${skill}: the scripture agent gave no answer (${state || "no task"})`
  );
}

/** The agent's links are its API's (`/api/...`); the reader resolves them against this origin, under `/bible/`. */
const underBible = (body: unknown) =>
  JSON.stringify(body).replace(/"\/api\//g, '"/bible/api/');

const reply = (body: unknown, maxAge: number) =>
  new Response(underBible(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
    },
  });

/** The path asked → the skill and its arguments; null for a path the Bible API does not have. */
export function skillForPath(
  path: string,
  query: URLSearchParams
): { skill: string; args: Record<string, unknown>; maxAge: number } | null {
  const p = path.replace(/^\/bible\/api\//, "");
  if (p === "available_translations.json")
    return { skill: "list-translations", args: {}, maxAge: 300 };
  if (p === "available_datasets.json")
    return { skill: "list-datasets", args: {}, maxAge: 300 };
  let m = /^d\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_./-]+)\.json$/.exec(p);
  if (m && !m[2]!.includes(".."))
    return {
      skill: "read-dataset",
      args: { dataset: m[1], path: m[2] },
      maxAge: 86400,
    };
  m = /^search\/([a-z]{2,8})$/.exec(p);
  if (m) {
    const translationId = query.get("translation") ?? "";
    const q = (query.get("q") ?? "").trim();
    if (!ID.test(translationId) || !q) return null;
    return {
      skill: "search-verses",
      args: {
        language: m[1],
        translationId,
        q,
        ...(query.get("page") ? { page: Number(query.get("page")) } : {}),
        ...(query.get("per_page")
          ? { perPage: Number(query.get("per_page")) }
          : {}),
      },
      maxAge: 300,
    };
  }
  m = /^([A-Za-z0-9_-]+)\/(books|verification)\.json$/.exec(p);
  if (m)
    return {
      skill: m[2] === "books" ? "list-books" : "translation-attestation",
      args: { translationId: m[1] },
      maxAge: 86400,
    };
  m =
    /^([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/(\d{1,3})(?:\.([A-Za-z0-9_-]{1,40})\.audioTimings)?\.json$/.exec(
      p
    );
  if (m)
    return m[4]
      ? {
          skill: "audio-timings",
          args: {
            translationId: m[1],
            book: m[2],
            chapter: Number(m[3]),
            reader: m[4],
          },
          maxAge: 86400,
        }
      : {
          skill: "read-chapter",
          args: {
            translationId: m[1],
            book: m[2],
            chapter: Number(m[3]),
            includeProofs: true,
          },
          maxAge: 86400,
        };
  return null;
}

async function edgeCached(
  c: Context<{ Bindings: BibleEnv }>,
  build: () => Promise<Response>
): Promise<Response> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches
    ?.default;
  const key = new Request(c.req.url, { method: "GET" });
  const hit = cache ? await cache.match(key) : undefined;
  if (hit) return hit;
  const res = await build();
  if (cache && res.status === 200)
    c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export const bibleRoutes = new Hono<{ Bindings: BibleEnv }>();

// A whole translation for reading offline: its books, then each book asked once, streamed as complete.json.
bibleRoutes.get("/bible/api/:t/complete.json", async (c) => {
  const t = c.req.param("t");
  if (!ID.test(t)) return c.json({ error: "not found" }, 404);
  let books: { translation: unknown; books: Array<{ id: string }> };
  try {
    books = (await askScripture(c.env, "list-books", {
      translationId: t,
    })) as typeof books;
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      e instanceof Refused ? 404 : 502
    );
  }
  const enc = new TextEncoder();
  const env = c.env;
  const stream = new ReadableStream<Uint8Array>({
    async start(ctl) {
      ctl.enqueue(
        enc.encode(`{"translation":${underBible(books.translation)},"books":[`)
      );
      let first = true;
      for (const b of books.books) {
        const one = (await askScripture(env, "read-book", {
          translationId: t,
          book: b.id,
        }).catch(() => null)) as { book?: unknown } | null;
        if (!one?.book) continue;
        ctl.enqueue(enc.encode(`${first ? "" : ","}${underBible(one.book)}`));
        first = false;
      }
      ctl.enqueue(enc.encode("]}"));
      ctl.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
});

bibleRoutes.get("/bible/api/*", async (c) => {
  const url = new URL(c.req.url);
  const call = skillForPath(url.pathname, url.searchParams);
  if (!call) return c.json({ error: `not found: ${url.pathname}` }, 404);
  return edgeCached(c, async () => {
    try {
      return reply(
        await askScripture(c.env, call.skill, call.args),
        call.maxAge
      );
    } catch (e) {
      const words = e instanceof Error ? e.message : String(e);
      return c.json({ error: words }, e instanceof Refused ? 404 : 502);
    }
  });
});
