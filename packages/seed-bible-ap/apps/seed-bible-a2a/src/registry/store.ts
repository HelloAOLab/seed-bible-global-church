// THE STORE — D1 rows for what the crawl found. Rebuildable: `wipe` + `apply` from a fresh crawl produces the same
// rows (the rebuild smoke proves it). A document the shelf stopped listing becomes a tombstone (`withdrawn_at`),
// never a silent delete, so a query can say "it was here until …".
import type { IndexedOffering, Shelf, ShelfCrawl } from "./crawl";

export interface OfferingRow {
  owner: string;
  entry_id: string;
  shelf: string;
  version: number;
  release_id: string;
  release_signed: number;
  passage: string;
  passage_ref: string;
  kind: string;
  title: string;
  descriptor_id: string;
  descriptor_json: string;
  markdown_path: string | null;
  indexed_at: string;
  withdrawn_at: string | null;
}

export async function listShelves(db: D1Database): Promise<Shelf[]> {
  const r = await db
    .prepare("SELECT name, endpoint, kind FROM shelves ORDER BY name")
    .all<{ name: string; endpoint: string; kind: "person" | "organization" }>();
  return r.results ?? [];
}

export async function putShelf(
  db: D1Database,
  shelf: Shelf,
  now = new Date().toISOString()
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO shelves (name, endpoint, kind, registered_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(name) DO UPDATE SET endpoint = ?2, kind = ?3"
    )
    .bind(shelf.name, shelf.endpoint, shelf.kind, now)
    .run();
}

export async function removeShelf(db: D1Database, name: string): Promise<void> {
  await db.prepare("DELETE FROM shelves WHERE name = ?").bind(name).run();
}

/** Apply one shelf's crawl: upsert what it found, tombstone what it no longer lists, log the run. */
export async function applyCrawl(
  db: D1Database,
  c: ShelfCrawl,
  now = new Date().toISOString()
): Promise<{ indexed: number; withdrawn: number }> {
  if (!c.ok || !c.owner) {
    await db
      .prepare(
        "INSERT INTO crawl_log (run_at, shelf, ok, error, listed, indexed, withdrawn, skipped) VALUES (?,?,?,?,?,?,?,?)"
      )
      .bind(
        now,
        c.shelf,
        0,
        c.error ?? "no owner",
        c.listed,
        0,
        0,
        JSON.stringify(c.skipped)
      )
      .run();
    return { indexed: 0, withdrawn: 0 };
  }
  const seen = new Set(c.offerings.map((o) => o.entryId));
  const stmts: D1PreparedStatement[] = c.offerings.map((o: IndexedOffering) =>
    db
      .prepare(
        `INSERT INTO offerings (owner, entry_id, shelf, version, release_id, release_signed, passage, passage_ref, kind, title, descriptor_id, descriptor_json, markdown_path, indexed_at, withdrawn_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, NULL)
         ON CONFLICT(owner, entry_id) DO UPDATE SET shelf = ?3, version = ?4, release_id = ?5, release_signed = ?6, passage = ?7, passage_ref = ?8, kind = ?9, title = ?10, descriptor_id = ?11, descriptor_json = ?12, markdown_path = ?13, indexed_at = ?14, withdrawn_at = NULL`
      )
      .bind(
        o.owner,
        o.entryId,
        o.shelf,
        o.version,
        o.releaseId,
        o.releaseSigned ? 1 : 0,
        o.passage,
        o.passageRef,
        o.kind,
        o.title,
        o.descriptorId,
        JSON.stringify(o.descriptor),
        o.markdownPath,
        now
      )
  );
  // Tombstone every live row of this owner the shelf no longer lists.
  const live = await db
    .prepare(
      "SELECT entry_id FROM offerings WHERE owner = ? AND withdrawn_at IS NULL"
    )
    .bind(c.owner)
    .all<{ entry_id: string }>();
  const gone = (live.results ?? [])
    .map((r) => r.entry_id)
    .filter((id) => !seen.has(id));
  for (const id of gone)
    stmts.push(
      db
        .prepare(
          "UPDATE offerings SET withdrawn_at = ?1 WHERE owner = ?2 AND entry_id = ?3"
        )
        .bind(now, c.owner, id)
    );
  stmts.push(
    db
      .prepare(
        "INSERT INTO crawl_log (run_at, shelf, ok, error, listed, indexed, withdrawn, skipped) VALUES (?,?,?,?,?,?,?,?)"
      )
      .bind(
        now,
        c.shelf,
        1,
        null,
        c.listed,
        c.offerings.length,
        gone.length,
        JSON.stringify(c.skipped)
      )
  );
  await db.batch(stmts);
  return { indexed: c.offerings.length, withdrawn: gone.length };
}

export async function queryByPassage(
  db: D1Database,
  passage: string,
  opts: { kind?: string; max?: number } = {}
): Promise<OfferingRow[]> {
  const max = Math.min(Math.max(opts.max ?? 50, 1), 200);
  const r = opts.kind
    ? await db
        .prepare(
          "SELECT * FROM offerings WHERE passage = ?1 AND kind = ?2 AND withdrawn_at IS NULL ORDER BY indexed_at DESC LIMIT ?3"
        )
        .bind(passage, opts.kind, max)
        .all<OfferingRow>()
    : await db
        .prepare(
          "SELECT * FROM offerings WHERE passage = ?1 AND withdrawn_at IS NULL ORDER BY indexed_at DESC LIMIT ?2"
        )
        .bind(passage, max)
        .all<OfferingRow>();
  return r.results ?? [];
}

/** Every live row of a kind, newest first — what a customization list is (not passage-scoped). */
export async function queryByKind(
  db: D1Database,
  kind: string,
  max = 100
): Promise<OfferingRow[]> {
  const r = await db
    .prepare(
      "SELECT * FROM offerings WHERE kind = ?1 AND withdrawn_at IS NULL ORDER BY indexed_at DESC LIMIT ?2"
    )
    .bind(kind, Math.min(Math.max(max, 1), 200))
    .all<OfferingRow>();
  return r.results ?? [];
}

/** The newest live rows whose owner address or shelf name is one of `owners`. */
export async function queryRecent(
  db: D1Database,
  owners: string[],
  max = 50
): Promise<OfferingRow[]> {
  const keys = [
    ...new Set(owners.map((o) => o.toLowerCase()).filter(Boolean)),
  ].slice(0, 50);
  if (!keys.length) return [];
  const marks = keys.map((_, i) => `?${i + 1}`).join(",");
  const r = await db
    .prepare(
      `SELECT * FROM offerings WHERE (owner IN (${marks}) OR lower(shelf) IN (${marks})) AND withdrawn_at IS NULL ORDER BY indexed_at DESC LIMIT ?${keys.length + 1}`
    )
    .bind(...keys, Math.min(Math.max(max, 1), 200))
    .all<OfferingRow>();
  return r.results ?? [];
}

/** Every row, tombstones included — what the rebuild smoke compares before and after a wipe. */
export async function snapshot(
  db: D1Database
): Promise<Array<Omit<OfferingRow, "indexed_at" | "withdrawn_at">>> {
  const r = await db
    .prepare(
      "SELECT owner, entry_id, shelf, version, release_id, release_signed, passage, passage_ref, kind, title, descriptor_id, descriptor_json, markdown_path FROM offerings WHERE withdrawn_at IS NULL ORDER BY owner, entry_id"
    )
    .all<Omit<OfferingRow, "indexed_at" | "withdrawn_at">>();
  return r.results ?? [];
}

/** Drop the derived rows (never the shelves: that is configuration). */
export async function wipe(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM offerings"),
    db.prepare("DELETE FROM crawl_log"),
  ]);
}
