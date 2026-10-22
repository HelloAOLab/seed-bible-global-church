// THE CRAWL — hard-problems §12, pure over a fetch. For each registered shelf: list the owner's public
// `seed-bible/public` folder through its public door, read every JSON-LD document, keep the ones that are a
// `seed:Offering` the OWNER published with a signed release at the current version, and index them by the chapter
// they are offered for. A document the shelf no longer lists is a withdrawal (a tombstone in the store). One shelf
// failing never aborts the run; its error is recorded and the rest is indexed.
import { Offering, conceptIri } from "../../../../lib/seed-schema";
import { chapterOf } from "../../../../lib/seed-protocol";
import {
  publicShelfList,
  publicShelfRead,
  type Fetch,
  type ShelfEntry,
} from "../../../../lib/a2a-client";

export interface Shelf {
  name: string;
  endpoint: string;
  kind: "person" | "organization";
}

export interface IndexedOffering {
  owner: string;
  entryId: string;
  shelf: string;
  version: number;
  releaseId: string;
  releaseSigned: boolean;
  passage: string;
  passageRef: string;
  kind: string;
  title: string;
  descriptorId: string;
  descriptor: Record<string, unknown>;
  markdownPath: string | null;
}

export interface ShelfCrawl {
  shelf: string;
  owner: string | null;
  ok: boolean;
  error?: string;
  listed: number;
  offerings: IndexedOffering[];
  /** Documents seen and not indexed, each with the reason — said, never silent. */
  skipped: Array<{ entry: string; reason: string }>;
}

const KIND_NOTATIONS = [
  "video",
  "article",
  "episode",
  "study",
  "note",
  "playlist",
  "plan",
  "image",
] as const;

const sameAgent = (a: string, b: string) =>
  a.replace(/^eip155:\d+:/, "").toLowerCase() ===
  b.replace(/^eip155:\d+:/, "").toLowerCase();

export async function crawlShelf(
  fetchImpl: Fetch,
  shelf: Shelf,
  folder: string
): Promise<ShelfCrawl> {
  const out: ShelfCrawl = {
    shelf: shelf.name,
    owner: null,
    ok: false,
    listed: 0,
    offerings: [],
    skipped: [],
  };
  let listing;
  try {
    listing = await publicShelfList(fetchImpl, shelf.endpoint, folder);
  } catch (e) {
    return { ...out, error: e instanceof Error ? e.message : String(e) };
  }
  out.owner = listing.owner || null;
  const docs = listing.files.filter((f) => !f.isFolder);
  out.listed = docs.length;
  if (listing.truncated)
    out.skipped.push({
      entry: "*",
      reason: `the shelf lists more than were read (${listing.count}); raise max`,
    });
  const markdownByStem = new Map<string, ShelfEntry>();
  for (const f of docs)
    if (/\.md$/i.test(f.name))
      markdownByStem.set(
        `${f.folder ?? ""}/${f.name.replace(/\.md$/i, "")}`,
        f
      );
  for (const f of docs) {
    if (!/\.jsonld$/i.test(f.name)) continue;
    const label = f.path ?? `${f.folder ?? ""}/${f.name}`;
    if (!f.release?.releaseId) {
      out.skipped.push({
        entry: label,
        reason: "public but not released — no signed release to verify",
      });
      continue;
    }
    if (f.release.signed !== true) {
      out.skipped.push({
        entry: label,
        reason: `release ${f.release.releaseId} is not signed`,
      });
      continue;
    }
    let read;
    try {
      read = await publicShelfRead(fetchImpl, shelf.endpoint, { id: f.id });
    } catch (e) {
      out.skipped.push({
        entry: label,
        reason: `read failed: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    if (!read.read || !read.text) {
      out.skipped.push({
        entry: label,
        reason: read.refused ?? "not readable",
      });
      continue;
    }
    let doc: unknown;
    try {
      doc = JSON.parse(read.text);
    } catch {
      out.skipped.push({ entry: label, reason: "not JSON" });
      continue;
    }
    const parsed = Offering.safeParse(doc);
    if (!parsed.success) {
      if ((doc as { "@type"?: unknown })?.["@type"] !== "seed:Offering")
        out.skipped.push({ entry: label, reason: "not a seed:Offering" });
      else
        out.skipped.push({
          entry: label,
          reason: `seed:Offering does not fit its shape: ${parsed.error.issues.map((i) => i.path.join(".") || i.message).join(", ")}`,
        });
      continue;
    }
    const o = parsed.data;
    if (!listing.owner || !sameAgent(o.publishedBy, listing.owner)) {
      out.skipped.push({
        entry: label,
        reason: `publishedBy ${o.publishedBy} is not the shelf's owner ${listing.owner}`,
      });
      continue;
    }
    const kind =
      KIND_NOTATIONS.find(
        (k) => conceptIri("offeringkind", k) === o.offeringKind
      ) ?? "other";
    out.offerings.push({
      owner: listing.owner,
      entryId: f.id,
      shelf: shelf.name,
      version: Number(f.version ?? 1),
      releaseId: f.release.releaseId,
      releaseSigned: true,
      passage: chapterOf(o.offeredForPassage),
      passageRef: o.offeredForPassage,
      kind,
      title: o.label,
      descriptorId: o["@id"],
      descriptor: doc as Record<string, unknown>,
      markdownPath:
        markdownByStem.get(
          `${f.folder ?? ""}/${f.name.replace(/\.jsonld$/i, "")}`
        )?.path ?? null,
    });
  }
  out.ok = true;
  return out;
}

export async function crawlAll(
  fetchImpl: Fetch,
  shelves: Shelf[],
  folder: string
): Promise<ShelfCrawl[]> {
  const out: ShelfCrawl[] = [];
  for (const s of shelves) out.push(await crawlShelf(fetchImpl, s, folder));
  return out;
}
