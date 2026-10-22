// THE LIBRARY AS A FILE SHELF — hard-problems §1 and §3. A reader's marks live in their own Library under
// `seed-bible/<collection>/`, ONE JSON-LD document per chapter (`JHN/3.jsonld`, a `@graph` of items), with a
// per-collection `_manifest.jsonld` as the index and change feed. This module is the pure half: paths, the
// documents' shapes, the idempotent put, the item-level merge, and the `library.*` plan steps a person's agent
// runs. It touches no network; reader-a2a drives it over the ask-as-me wire, reader-mcp exposes the merge as a tool.
import { BucketItem, SEED_CONTEXT } from "../seed-schema";
import { chapterOf, type OsisRef } from "../seed-protocol";

export const SEED_FOLDER = "seed-bible";
export type Collection =
  | "highlights"
  | "annotations"
  | "bookmarks"
  | "saves"
  | "progress"
  | "history";
/** Collections bucketed by chapter; the rest keep one bucket. */
const CHAPTERED: ReadonlySet<Collection> = new Set([
  "highlights",
  "annotations",
  "history",
]);
/** The Library caps a text document here; a bucket splits before it. */
export const LIBRARY_TEXT_MAX_CHARS = 12_000;

export interface BucketDocument {
  "@context": typeof SEED_CONTEXT;
  /** `seed:chapterRef` — the OSIS chapter this bucket holds the marks of; absent for a single-bucket collection. */
  chapterRef?: OsisRef;
  collection: Collection;
  "@graph": BucketItem[];
}

export interface ManifestEntry {
  bucket: string;
  /** The Library's own version of the bucket document after the last save. */
  version: number;
  count: number;
  updatedAt: string;
}
export interface ManifestDocument {
  "@context": typeof SEED_CONTEXT;
  collection: Collection;
  buckets: Record<string, ManifestEntry>;
  updatedAt: string;
}

/** Where a collection's documents live: `seed-bible/highlights/JHN` for a chapter, `seed-bible/bookmarks` otherwise. */
export function bucketFolder(
  collection: Collection,
  chapterRef?: OsisRef
): string {
  if (!CHAPTERED.has(collection)) return `${SEED_FOLDER}/${collection}`;
  if (!chapterRef)
    throw new Error(
      `${collection} is bucketed by chapter — a chapter is required`
    );
  return `${SEED_FOLDER}/${collection}/${chapterOf(chapterRef).split(".")[0]}`;
}
/** The document name: `3.jsonld` for John 3, `bookmarks.jsonld` for a single-bucket collection. */
export function bucketName(
  collection: Collection,
  chapterRef?: OsisRef
): string {
  if (!CHAPTERED.has(collection)) return `${collection}.jsonld`;
  if (!chapterRef)
    throw new Error(
      `${collection} is bucketed by chapter — a chapter is required`
    );
  return `${chapterOf(chapterRef).split(".")[1]}.jsonld`;
}
/** The manifest key of a bucket: `JHN.3`, or the collection name for a single bucket. */
export function bucketKey(
  collection: Collection,
  chapterRef?: OsisRef
): string {
  return CHAPTERED.has(collection) ? chapterOf(chapterRef ?? "") : collection;
}
export const manifestFolder = (collection: Collection) =>
  `${SEED_FOLDER}/${collection}`;
export const MANIFEST_NAME = "_manifest.jsonld";

export function emptyBucket(
  collection: Collection,
  chapterRef?: OsisRef
): BucketDocument {
  return {
    "@context": SEED_CONTEXT,
    collection,
    ...(CHAPTERED.has(collection) && chapterRef
      ? { chapterRef: chapterOf(chapterRef) }
      : {}),
    "@graph": [],
  };
}
export function emptyManifest(
  collection: Collection,
  now = new Date().toISOString()
): ManifestDocument {
  return { "@context": SEED_CONTEXT, collection, buckets: {}, updatedAt: now };
}

/** A bucket document out of the text a Library read returned; refuses anything not bucket-shaped. */
export function parseBucket(
  text: string,
  collection: Collection,
  chapterRef?: OsisRef
): BucketDocument {
  const j = JSON.parse(text) as Partial<BucketDocument>;
  if (!Array.isArray(j["@graph"]))
    throw new Error("not a bucket document: no @graph");
  const graph = j["@graph"].map((it) => BucketItem.parse(it));
  return {
    ...emptyBucket(collection, chapterRef),
    ...(j.chapterRef ? { chapterRef: j.chapterRef } : {}),
    "@graph": graph,
  };
}
export function parseManifest(
  text: string,
  collection: Collection
): ManifestDocument {
  const j = JSON.parse(text) as Partial<ManifestDocument>;
  if (!j.buckets || typeof j.buckets !== "object")
    throw new Error("not a manifest document: no buckets");
  return {
    ...emptyManifest(collection),
    buckets: j.buckets,
    updatedAt: j.updatedAt ?? new Date().toISOString(),
  };
}
export const serialize = (doc: BucketDocument | ManifestDocument) =>
  JSON.stringify(doc);

/** Is this bucket full — would one more item of `extraChars` push the document past the Library's cap? */
export function bucketFull(bucket: BucketDocument, extraChars = 0): boolean {
  return serialize(bucket).length + extraChars >= LIBRARY_TEXT_MAX_CHARS;
}

export interface PutOutcome {
  bucket: BucketDocument;
  /** false ⇒ the opId was already in the bucket: a replay, nothing to save. */
  changed: boolean;
  replaced: boolean;
}

/** The idempotent put: an item with this opId already there ⇒ unchanged; the same @id ⇒ replaced; else appended. */
export function applyPut(bucket: BucketDocument, item: BucketItem): PutOutcome {
  const graph = bucket["@graph"];
  if (graph.some((it) => it.opId === item.opId))
    return { bucket, changed: false, replaced: false };
  const at = graph.findIndex((it) => it["@id"] === item["@id"]);
  const next = [...graph];
  if (at >= 0) next[at] = item;
  else next.push(item);
  return {
    bucket: { ...bucket, "@graph": next },
    changed: true,
    replaced: at >= 0,
  };
}

export interface MergeReport {
  added: string[];
  replaced: string[];
  kept: string[];
  conflicts: Array<{ id: string; keptAs: string }>;
}

const later = (a?: string, b?: string) => (a ?? "") > (b ?? "");

/**
 * The item-level merge (hard-problems §3, `skill:seed/bucket-merge`): keyed by `@id`; a replayed opId is kept;
 * otherwise the later `updatedAt` wins — except a note whose body differs on both sides, which is kept twice,
 * the incoming one flagged `conflictOf` the current. Deletions are tombstones and follow the same later-wins rule.
 */
export function mergeBuckets(
  current: BucketDocument,
  incoming: BucketDocument
): { bucket: BucketDocument; report: MergeReport } {
  const report: MergeReport = {
    added: [],
    replaced: [],
    kept: [],
    conflicts: [],
  };
  const byId = new Map(current["@graph"].map((it) => [it["@id"], it] as const));
  for (const inc of incoming["@graph"]) {
    const cur = byId.get(inc["@id"]);
    if (!cur) {
      byId.set(inc["@id"], inc);
      report.added.push(inc["@id"]);
      continue;
    }
    if (cur.opId === inc.opId) {
      report.kept.push(inc["@id"]);
      continue;
    }
    // A note edited from the copy the Library holds (`supersedes` names its opId) is a plain update; one edited
    // from an older copy collided with a write it never saw and is kept beside it.
    if (
      cur["@type"] === "seed:Annotation" &&
      inc["@type"] === "seed:Annotation" &&
      cur.note !== inc.note &&
      !cur.deleted &&
      !inc.deleted &&
      inc.supersedes !== cur.opId &&
      cur.supersedes !== inc.opId
    ) {
      const keptAs = `${inc["@id"]}~conflict-${inc.opId}`;
      byId.set(keptAs, { ...inc, "@id": keptAs, conflictOf: cur["@id"] });
      report.conflicts.push({ id: inc["@id"], keptAs });
      continue;
    }
    if (cur.supersedes === inc.opId) report.kept.push(inc["@id"]);
    else if (
      inc.supersedes === cur.opId ||
      // A tie goes to the incoming write: a device's edit-then-delete collapses into one tombstone that names the
      // never-sent edit, and in the same millisecond as the Library's copy it would otherwise lose to it.
      !later(cur.updatedAt, inc.updatedAt)
    ) {
      byId.set(inc["@id"], inc);
      report.replaced.push(inc["@id"]);
    } else report.kept.push(inc["@id"]);
  }
  return { bucket: { ...current, "@graph": [...byId.values()] }, report };
}

/** The manifest after a bucket was saved: one entry per bucket key, the collection's `updatedAt` moved. */
export function noteBucketSaved(
  manifest: ManifestDocument,
  key: string,
  bucket: BucketDocument,
  name: string,
  version: number,
  now = new Date().toISOString()
): ManifestDocument {
  return {
    ...manifest,
    updatedAt: now,
    buckets: {
      ...manifest.buckets,
      [key]: {
        bucket: name,
        version,
        count: bucket["@graph"].length,
        updatedAt: now,
      },
    },
  };
}

// ── The plan steps a person's agent runs (ap-home library-tools.ts shapes) ─────────────────────────
export interface PlanStep {
  toolId: string;
  args: Record<string, unknown>;
}
export const LIBRARY_FILE_READ = "library.file.read";
export const LIBRARY_FILES_LIST = "library.files.list";
export const LIBRARY_FILE_SAVE = "library.file.save";
export const LIBRARY_FILE_VISIBILITY = "library.file.visibility";
export const LIBRARY_FILE_PUBLISH = "library.file.publish";

/** A read by folder and name; with the document's `id` too, the agent fetches its body beside the index. */
export const readStep = (
  folder: string,
  name: string,
  id?: string
): PlanStep => ({
  toolId: LIBRARY_FILE_READ,
  args: { folder, name, ...(id ? { id } : {}) },
});
export const listStep = (folder: string): PlanStep => ({
  toolId: LIBRARY_FILES_LIST,
  args: { folder, max: 100 },
});
/** Re-save by `id` when the document exists (a new version); omitted mints one. Private unless said otherwise. */
export const saveJsonLdStep = (
  folder: string,
  name: string,
  text: string,
  id?: string,
  accessPolicy?: "public" | "private"
): PlanStep => ({
  toolId: LIBRARY_FILE_SAVE,
  args: {
    folder,
    name,
    text,
    kind: "json-ld",
    contentType: "application/ld+json",
    ...(id ? { id } : {}),
    ...(accessPolicy ? { accessPolicy } : {}),
  },
});
/** An image's bytes as a Library document (the record of a file; the serving plane's copy can be re-put from it). */
export const saveBytesStep = (
  folder: string,
  name: string,
  bytesB64: string,
  contentType: string,
  id?: string,
  accessPolicy?: "public" | "private"
): PlanStep => ({
  toolId: LIBRARY_FILE_SAVE,
  args: {
    folder,
    name,
    bytesB64,
    kind: "image",
    contentType,
    ...(id ? { id } : {}),
    ...(accessPolicy ? { accessPolicy } : {}),
  },
});
export const saveMarkdownStep = (
  folder: string,
  name: string,
  text: string,
  id?: string,
  accessPolicy?: "public" | "private"
): PlanStep => ({
  toolId: LIBRARY_FILE_SAVE,
  args: {
    folder,
    name,
    text,
    kind: "md",
    contentType: "text/markdown",
    ...(id ? { id } : {}),
    ...(accessPolicy ? { accessPolicy } : {}),
  },
});
export const visibilityStep = (
  id: string,
  accessPolicy: "public" | "private"
): PlanStep => ({
  toolId: LIBRARY_FILE_VISIBILITY,
  args: { id, accessPolicy },
});
export const publishStep = (id: string): PlanStep => ({
  toolId: LIBRARY_FILE_PUBLISH,
  args: { id },
});

/** What `library.file.read` answers (ap-home library-tools.ts): the text, or a refusal naming the Library's contents. */
export interface LibraryRead {
  read: boolean;
  text?: string;
  truncated?: boolean;
  refused?: string;
  file?: { id?: string; version?: number; name?: string; path?: string };
}
/** What `library.files.list` answers: the folder's entries (ap-home library-tools.ts). */
export interface LibraryList {
  files?: Array<{
    id?: string;
    name: string;
    folder?: string;
    path?: string;
    version?: number;
    size?: number;
    contentType?: string;
  }>;
  count?: number;
  truncated?: boolean;
  refused?: string;
}
export interface LibrarySaved {
  saved: boolean;
  file?: { id?: string; version?: number; name?: string; path?: string };
  refused?: string;
}
/** A read that says "no document named …" is an empty shelf, not an error. */
export const isMissing = (r: LibraryRead): boolean =>
  !r.read && /no document named/i.test(r.refused ?? "");
