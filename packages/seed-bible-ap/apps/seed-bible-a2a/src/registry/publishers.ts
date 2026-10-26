// THE PUBLISHERS THE REGISTRY FOLLOWS — beside the shelves (a person's or organization's public folder, read document
// by document), a publisher that answers the publisher contract is read by `publisher.changes`: works published,
// revised or withdrawn since the cursor the last crawl ended on. The registry keeps the catalog — one row per work,
// never a work's content — so a reader can see what is new across every publisher it follows, and an item at a
// verse is still fetched from the publisher that holds it (`publisher.at-verse` through the workspace). Rebuildable:
// a cursor of 0 reads the whole history again.
export interface Publisher {
  /** The publisher's name as the registry lists it (its host). */
  name: string;
  /** Its contract door: `POST <endpoint>/publisher/<skill>`. */
  endpoint: string;
  /** content | scripture — the kind of publisher, for a reader's labels. */
  kind: string;
}

export interface WorkChange {
  work: string;
  title: string;
  kind: string;
  version: number;
  change: "published" | "withdrawn";
  /** When it changed, ms since the epoch, as the publisher says. */
  at: number;
}

export interface PublisherCrawl {
  publisher: string;
  ok: boolean;
  error?: string;
  /** Every change read this run, oldest first; a work changed twice keeps the latest. */
  changes: WorkChange[];
  /** Where the next crawl starts. Unchanged when the run failed. */
  cursor: string;
  pages: number;
}

export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

/** At most this many pages per run: a publisher with a long history is read over several crawls, never in one. */
export const MAX_PAGES = 20;
const PAGE = 200;

const isChange = (c: unknown): c is WorkChange => {
  const o = c as Record<string, unknown>;
  return (
    !!o &&
    typeof o.work === "string" &&
    typeof o.title === "string" &&
    typeof o.kind === "string" &&
    Number.isFinite(o.version) &&
    (o.change === "published" || o.change === "withdrawn") &&
    Number.isFinite(o.at)
  );
};

export async function crawlPublisher(
  fetchImpl: Fetch,
  p: Publisher,
  cursor: string
): Promise<PublisherCrawl> {
  const out: PublisherCrawl = {
    publisher: p.name,
    ok: false,
    changes: [],
    cursor,
    pages: 0,
  };
  const latest = new Map<string, WorkChange>();
  let since = Number(cursor) || 0;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetchImpl(
        `${p.endpoint.replace(/\/$/, "")}/publisher/changes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ since, limit: PAGE }),
        }
      );
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        changes?: unknown[];
        cursor?: string;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok)
        throw new Error(body?.error ?? `${p.name} answered ${res.status}`);
      out.pages++;
      const changes = (body.changes ?? []).filter(isChange);
      const bad = (body.changes ?? []).length - changes.length;
      if (bad)
        throw new Error(
          `${p.name} listed ${bad} change(s) the registry cannot read`
        );
      for (const c of changes) latest.set(c.work, c);
      const next = Number(body.cursor ?? since) || since;
      // A full page may hide more behind it; a short page, or a cursor that did not move, is the end.
      if (changes.length < PAGE || next <= since) {
        since = Math.max(since, next);
        break;
      }
      since = next;
    }
    out.changes = [...latest.values()].sort((a, b) => a.at - b.at);
    out.cursor = String(since);
    out.ok = true;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}

export async function crawlPublishers(
  fetchImpl: Fetch,
  publishers: Publisher[],
  cursorOf: (name: string) => Promise<string>
): Promise<PublisherCrawl[]> {
  return Promise.all(
    publishers.map(async (p) =>
      crawlPublisher(fetchImpl, p, await cursorOf(p.name))
    )
  );
}

// ── the store ──

export interface WorkRow {
  publisher: string;
  work: string;
  title: string;
  kind: string;
  version: number;
  change: string;
  changed_at: number;
  indexed_at: string;
}

export async function listPublishers(db: D1Database): Promise<Publisher[]> {
  const r = await db
    .prepare("SELECT name, endpoint, kind FROM publishers ORDER BY name")
    .all<Publisher>();
  return r.results ?? [];
}

export async function putPublisher(
  db: D1Database,
  p: Publisher,
  now = new Date().toISOString()
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO publishers (name, endpoint, kind, cursor, registered_at) VALUES (?1, ?2, ?3, '0', ?4) ON CONFLICT(name) DO UPDATE SET endpoint = ?2, kind = ?3"
    )
    .bind(p.name, p.endpoint, p.kind, now)
    .run();
}

export async function publisherCursor(
  db: D1Database,
  name: string
): Promise<string> {
  const r = await db
    .prepare("SELECT cursor FROM publishers WHERE name = ?")
    .bind(name)
    .first<{ cursor: string }>();
  return r?.cursor ?? "0";
}

/** Apply one publisher's crawl: upsert its works, move its cursor, remember the run. */
export async function applyPublisherCrawl(
  db: D1Database,
  c: PublisherCrawl,
  now = new Date().toISOString()
): Promise<{ indexed: number }> {
  if (!c.ok) {
    await db
      .prepare(
        "UPDATE publishers SET last_crawl_at = ?, last_error = ? WHERE name = ?"
      )
      .bind(now, c.error ?? "failed", c.publisher)
      .run();
    return { indexed: 0 };
  }
  const stmts = c.changes.map((w) =>
    db
      .prepare(
        `INSERT INTO works (publisher, work, title, kind, version, change, changed_at, indexed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(publisher, work) DO UPDATE SET title = ?3, kind = ?4, version = ?5, change = ?6, changed_at = ?7, indexed_at = ?8`
      )
      .bind(
        c.publisher,
        w.work,
        w.title,
        w.kind,
        w.version,
        w.change,
        w.at,
        now
      )
  );
  stmts.push(
    db
      .prepare(
        "UPDATE publishers SET cursor = ?, last_crawl_at = ?, last_error = NULL WHERE name = ?"
      )
      .bind(c.cursor, now, c.publisher)
  );
  await db.batch(stmts);
  return { indexed: c.changes.length };
}

/** The works the registry knows, newest change first; withdrawn ones only when asked. */
export async function listWorks(
  db: D1Database,
  opts: {
    publisher?: string;
    kind?: string;
    withdrawn?: boolean;
    max?: number;
  } = {}
): Promise<WorkRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.publisher) {
    where.push("publisher = ?");
    binds.push(opts.publisher);
  }
  if (opts.kind) {
    where.push("kind = ?");
    binds.push(opts.kind);
  }
  if (!opts.withdrawn) where.push("change = 'published'");
  const max = Math.min(500, Math.max(1, opts.max ?? 100));
  const r = await db
    .prepare(
      `SELECT * FROM works${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY changed_at DESC LIMIT ${max}`
    )
    .bind(...binds)
    .all<WorkRow>();
  return r.results ?? [];
}
