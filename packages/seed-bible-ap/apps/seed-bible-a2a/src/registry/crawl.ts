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
  "customization",
  "profile",
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
      passage: o.offeredForPassage ? chapterOf(o.offeredForPassage) : "*",
      passageRef: o.offeredForPassage ?? "*",
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

/** A public picture on a shelf: `seed-bible/files/<sha256>.<ext>`, the bytes a page loads from the serving plane. */
export interface ShelfImage {
  owner: string;
  id: string;
  /** `<sha256>.<ext>` — the serving plane's key under the owner. */
  name: string;
  contentType: string;
}

const IMAGE_NAME = /^[a-f0-9]{64}\.(jpg|png|webp|gif|avif|svg|pdf)$/i;

/** The public pictures a shelf lists in its files folder. A shelf failing lists none; the error is returned. */
export async function crawlImages(
  fetchImpl: Fetch,
  shelf: Shelf,
  folder = "seed-bible/files"
): Promise<{ images: ShelfImage[]; error?: string }> {
  let listing;
  try {
    listing = await publicShelfList(fetchImpl, shelf.endpoint, folder);
  } catch (e) {
    return { images: [], error: e instanceof Error ? e.message : String(e) };
  }
  const images: ShelfImage[] = [];
  for (const f of listing.files) {
    if (f.isFolder || !IMAGE_NAME.test(f.name)) continue;
    if (!(f.contentType ?? "").startsWith("image/") && !/\.pdf$/i.test(f.name))
      continue;
    images.push({
      owner: listing.owner,
      id: f.id,
      name: f.name.toLowerCase(),
      contentType: f.contentType ?? "application/octet-stream",
    });
  }
  return { images };
}

/** The bucket the serving plane serves pictures from, as the refill needs it. */
export interface FileBucket {
  head(key: string): Promise<unknown | null>;
  put(
    key: string,
    bytes: ArrayBuffer,
    opts: { httpMetadata: { contentType: string; cacheControl: string } }
  ): Promise<unknown>;
}

/**
 * The serving plane's copy of every public picture, re-put from the shelf when the bucket lacks it (ADR-0004: the
 * vault is the record, the bucket is rebuildable). One read per missing picture; present ones cost a head.
 */
export async function refillImages(
  fetchImpl: Fetch,
  bucket: FileBucket,
  shelf: Shelf,
  images: ShelfImage[]
): Promise<{
  present: number;
  refilled: number;
  failed: Array<{ name: string; reason: string }>;
}> {
  let present = 0;
  let refilled = 0;
  const failed: Array<{ name: string; reason: string }> = [];
  for (const img of images) {
    const key = `${img.owner}/${img.name}`;
    if (await bucket.head(key)) {
      present++;
      continue;
    }
    try {
      const read = await publicShelfRead(fetchImpl, shelf.endpoint, {
        id: img.id,
      });
      if (!read.read || !read.bytesB64) {
        failed.push({
          name: img.name,
          reason: read.refused ?? "no bytes on the shelf",
        });
        continue;
      }
      const bytes = Uint8Array.from(atob(read.bytesB64), (ch) =>
        ch.charCodeAt(0)
      );
      await bucket.put(key, bytes.slice().buffer as ArrayBuffer, {
        httpMetadata: {
          contentType: read.contentType ?? img.contentType,
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      refilled++;
    } catch (e) {
      failed.push({
        name: img.name,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { present, refilled, failed };
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
