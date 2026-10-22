// THE VAULT PATH — hard-problems §1/§2. A mark is written into the READER'S OWN Library by THEIR agent: this
// workspace reads the chapter bucket over the wire, applies the idempotent put (lib/library-client), and re-saves
// the bucket and the collection's manifest, each as one supplied `library.*` step at the reader's agent. The
// workspace never writes a Library itself and holds nothing of the reader's between calls.
import {
  applyPut,
  bucketFolder,
  bucketKey,
  bucketName,
  emptyBucket,
  emptyManifest,
  isMissing,
  manifestFolder,
  MANIFEST_NAME,
  mergeBuckets,
  noteBucketSaved,
  parseBucket,
  parseManifest,
  readStep,
  saveJsonLdStep,
  serialize,
  type BucketDocument,
  type Collection,
  type LibraryRead,
  type LibrarySaved,
  type ManifestDocument,
} from "../../../../lib/library-client";
import { BucketItem } from "../../../../lib/seed-schema";
import { PersonAgent, type PersonAgentEnv } from "../clients/person-agent";
import { WireRefusal, wireFor, type WireEnv } from "../wires";

export type VaultEnv = PersonAgentEnv & WireEnv;

/** Work that may finish after the reply (the Worker's waitUntil); without it the work is awaited. */
export type Defer = (p: Promise<unknown>) => void;
let defer: Defer | null = null;
/** Hand the current request's waitUntil to the vault: the manifest update leaves the reply's critical path. */
export function setDefer(d: Defer | null) {
  defer = d;
}

export interface BucketRead {
  bucket: BucketDocument;
  /** The Library's id and version of the document; absent when the shelf has none yet. */
  file?: { id: string; version: number };
}

export interface PutReceipt {
  collection: Collection;
  key: string;
  /** false ⇒ the opId was already in the bucket; nothing was written (a replay). */
  changed: boolean;
  replaced: boolean;
  count: number;
  file: { id: string; version: number } | null;
  runRefs: string[];
}

/**
 * WHICH DOCUMENT HOLDS A BUCKET — the Library id behind a reader's folder/name, remembered so the next read names it and
 * the agent fetches the body beside the index (one vault round trip fewer). An id is a pointer, never content: what it
 * points at is read from the reader's own Library each time. In this isolate, and in the colo's cache for a day.
 */
const docIds = new Map<string, string>();
const docKey = (reader: string, folder: string, name: string) =>
  `https://doc-id.reader-a2a.internal/${encodeURIComponent(reader.toLowerCase())}/${encodeURIComponent(`${folder}/${name}`)}`;
const colo = (): Cache | null => {
  try {
    return (
      (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null
    );
  } catch {
    return null;
  }
};
async function knownDocId(
  reader: string,
  folder: string,
  name: string
): Promise<string | null> {
  const k = docKey(reader, folder, name);
  const hit = docIds.get(k);
  if (hit) return hit;
  try {
    const res = await colo()?.match(k);
    const id = res ? await res.text() : null;
    if (id) docIds.set(k, id);
    return id || null;
  } catch {
    return null;
  }
}
async function rememberDocId(
  reader: string,
  folder: string,
  name: string,
  id: string
) {
  const k = docKey(reader, folder, name);
  docIds.set(k, id);
  await colo()
    ?.put(
      k,
      new Response(id, { headers: { "cache-control": "max-age=86400" } })
    )
    .catch(() => undefined);
}
async function forgetDocId(reader: string, folder: string, name: string) {
  const k = docKey(reader, folder, name);
  docIds.delete(k);
  await colo()
    ?.delete(k)
    .catch(() => undefined);
}

/** The reader's agent, asked as them — refused in words when this workspace holds no wire for them. */
export async function agentFor(
  env: VaultEnv,
  reader: string
): Promise<PersonAgent> {
  const wire = await wireFor(env, reader);
  if (!wire)
    throw new WireRefusal(
      409,
      "this workspace holds no permission to ask your agent — sign in again to let it keep your Library"
    );
  return new PersonAgent(env, reader, wire);
}

/** The reader's agent answers a read of a document the shelf lacks as a REFUSED step ("no document named …"); that is
 *  an empty shelf, not an error. */
const missingShelf = (e: unknown) =>
  e instanceof WireRefusal && /no document named/i.test(e.message);

export async function readBucket(
  agent: PersonAgent,
  collection: Collection,
  chapterRef?: string
): Promise<BucketRead & { runRef: string | null }> {
  const folder = bucketFolder(collection, chapterRef);
  const name = bucketName(collection, chapterRef);
  const known = await knownDocId(agent.reader, folder, name);
  const read = (id?: string) =>
    agent.run<LibraryRead>(
      [readStep(folder, name, id)],
      `read my ${collection} for ${chapterRef ?? collection}`
    );
  let out: Awaited<ReturnType<typeof agent.run<LibraryRead>>>;
  try {
    out = await read(known ?? undefined);
    // A remembered id that names nothing (the document was removed and made again) is forgotten and the read is made
    // by name — a stale id must never make a bucket look empty.
    if (known && !out.result.read && isMissing(out.result)) {
      await forgetDocId(agent.reader, folder, name);
      out = await read();
    }
  } catch (e) {
    if (known && missingShelf(e)) {
      await forgetDocId(agent.reader, folder, name);
      return readBucket(agent, collection, chapterRef);
    }
    if (missingShelf(e))
      return { bucket: emptyBucket(collection, chapterRef), runRef: null };
    throw e;
  }
  const r = out.result;
  if (!r.read) {
    if (isMissing(r))
      return {
        bucket: emptyBucket(collection, chapterRef),
        runRef: out.runRef,
      };
    throw new WireRefusal(
      502,
      r.refused ?? `your agent could not read ${folder}/${name}`
    );
  }
  if (r.truncated)
    throw new WireRefusal(
      502,
      `${folder}/${name} is past the Library's text cap — split it (bucket-merge)`
    );
  const file = r.file?.id
    ? { id: r.file.id, version: Number(r.file.version ?? 1) }
    : undefined;
  if (file && file.id !== known)
    await rememberDocId(agent.reader, folder, name, file.id);
  return {
    bucket: parseBucket(r.text ?? "", collection, chapterRef),
    ...(file ? { file } : {}),
    runRef: out.runRef,
  };
}

export async function readManifest(
  agent: PersonAgent,
  collection: Collection
): Promise<{
  manifest: ManifestDocument;
  file?: { id: string; version: number };
}> {
  let out: Awaited<ReturnType<typeof agent.run<LibraryRead>>>;
  try {
    out = await agent.run<LibraryRead>(
      [readStep(manifestFolder(collection), MANIFEST_NAME)],
      `read my ${collection} manifest`
    );
  } catch (e) {
    if (missingShelf(e)) return { manifest: emptyManifest(collection) };
    throw e;
  }
  const r = out.result;
  if (!r.read) {
    if (isMissing(r)) return { manifest: emptyManifest(collection) };
    throw new WireRefusal(
      502,
      r.refused ?? `your agent could not read the ${collection} manifest`
    );
  }
  const file = r.file?.id
    ? { id: r.file.id, version: Number(r.file.version ?? 1) }
    : undefined;
  return {
    manifest: parseManifest(r.text ?? "", collection),
    ...(file ? { file } : {}),
  };
}

async function saveDoc(
  agent: PersonAgent,
  folder: string,
  name: string,
  text: string,
  id: string | undefined,
  why: string
): Promise<{ file: { id: string; version: number }; runRef: string | null }> {
  const out = await agent.run<LibrarySaved>(
    [saveJsonLdStep(folder, name, text, id)],
    why
  );
  const r = out.result;
  if (!r.saved || !r.file?.id)
    throw new WireRefusal(
      502,
      r.refused ?? `your agent did not save ${folder}/${name}`
    );
  if (r.file.id !== id)
    await rememberDocId(agent.reader, folder, name, r.file.id);
  return {
    file: { id: r.file.id, version: Number(r.file.version ?? 1) },
    runRef: out.runRef,
  };
}

/** Save a bucket (by id when it exists) and then the manifest, bucket first so the manifest never names a version that does not exist. */
async function saveBucketAndManifest(
  agent: PersonAgent,
  collection: Collection,
  chapterRef: string | undefined,
  bucket: BucketDocument,
  existing: { id: string; version: number } | undefined,
  why: string
): Promise<{ file: { id: string; version: number }; runRefs: string[] }> {
  const folder = bucketFolder(collection, chapterRef);
  const name = bucketName(collection, chapterRef);
  const saved = await saveDoc(
    agent,
    folder,
    name,
    serialize(bucket),
    existing?.id,
    why
  );
  const runRefs = saved.runRef ? [saved.runRef] : [];
  // The manifest is bookkeeping (which buckets moved); the reader waits for the bucket, not for it.
  const updateManifest = async () => {
    const { manifest, file: mf } = await readManifest(agent, collection);
    const next = noteBucketSaved(
      manifest,
      bucketKey(collection, chapterRef),
      bucket,
      name,
      saved.file.version
    );
    const savedManifest = await saveDoc(
      agent,
      manifestFolder(collection),
      MANIFEST_NAME,
      serialize(next),
      mf?.id,
      `update my ${collection} manifest`
    );
    if (savedManifest.runRef) runRefs.push(savedManifest.runRef);
  };
  if (defer) defer(updateManifest().catch(() => {}));
  else await updateManifest();
  return { file: saved.file, runRefs };
}

/** One mark into the reader's Library, idempotent by opId. The chapter is the item's passage's. */
export async function putMark(
  env: VaultEnv,
  reader: string,
  collection: Collection,
  raw: unknown
): Promise<PutReceipt> {
  const item = BucketItem.parse(raw);
  if (
    item.heldBy.toLowerCase().replace(/^eip155:\d+:/, "") !==
    reader.toLowerCase()
  )
    throw new WireRefusal(400, "the mark is not held by the signed-in reader");
  const chapterRef =
    collection === "highlights" || collection === "annotations"
      ? item.aboutPassage
      : undefined;
  const agent = await agentFor(env, reader);
  const current = await readBucket(agent, collection, chapterRef);
  const put = applyPut(current.bucket, item);
  const key = bucketKey(collection, chapterRef);
  if (!put.changed)
    return {
      collection,
      key,
      changed: false,
      replaced: false,
      count: current.bucket["@graph"].length,
      file: current.file ?? null,
      runRefs: current.runRef ? [current.runRef] : [],
    };
  const saved = await saveBucketAndManifest(
    agent,
    collection,
    chapterRef,
    put.bucket,
    current.file,
    `keep my ${collection.slice(0, -1)} on ${item.aboutPassage}`
  );
  return {
    collection,
    key,
    changed: true,
    replaced: put.replaced,
    count: put.bucket["@graph"].length,
    file: saved.file,
    runRefs: [...(current.runRef ? [current.runRef] : []), ...saved.runRefs],
  };
}

/** A device's bucket merged into the reader's at the item level (skill:seed/bucket-merge), then saved. */
export async function mergeBucket(
  env: VaultEnv,
  reader: string,
  collection: Collection,
  chapterRef: string | undefined,
  incoming: unknown,
  opId: string
) {
  const inc = parseBucket(JSON.stringify(incoming), collection, chapterRef);
  for (const it of inc["@graph"])
    if (
      it.heldBy.toLowerCase().replace(/^eip155:\d+:/, "") !==
      reader.toLowerCase()
    )
      throw new WireRefusal(
        400,
        "an item in the bucket is not held by the signed-in reader"
      );
  const agent = await agentFor(env, reader);
  const current = await readBucket(agent, collection, chapterRef);
  const { bucket, report } = mergeBuckets(current.bucket, inc);
  const changed =
    report.added.length + report.replaced.length + report.conflicts.length > 0;
  if (!changed)
    return {
      collection,
      key: bucketKey(collection, chapterRef),
      opId,
      changed: false,
      report,
      // The device takes the merged bucket as its truth either way, so it is on the receipt even when unchanged.
      bucket,
      file: current.file ?? null,
      runRefs: current.runRef ? [current.runRef] : [],
    };
  const saved = await saveBucketAndManifest(
    agent,
    collection,
    chapterRef,
    bucket,
    current.file,
    `merge my ${collection} for ${chapterRef ?? collection}`
  );
  return {
    collection,
    key: bucketKey(collection, chapterRef),
    opId,
    changed: true,
    report,
    bucket,
    file: saved.file,
    runRefs: [...(current.runRef ? [current.runRef] : []), ...saved.runRefs],
  };
}
