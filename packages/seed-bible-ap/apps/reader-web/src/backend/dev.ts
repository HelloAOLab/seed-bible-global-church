// THE IN-MEMORY BACKEND — the same contract as reader-a2a, with no network: tests and local pages run the whole UI
// against it. It keeps the buckets the way the reader's Library would (the same applyPut / mergeBuckets the
// workspace runs) and records every call so a test can assert "one run per bucket".
import {
  applyPut,
  bucketKey,
  emptyBucket,
  mergeBuckets,
  type BucketDocument,
  type Collection,
  type ManifestEntry,
} from "@seed/library-client";
import type { BucketItem } from "@seed/seed-schema";
import {
  BackendError,
  type PublishSliceArgs,
  type ReaderBackend,
  type SessionTicket,
  type WorkEntry,
  type WorkFolder,
  type UploadedFile,
  type LinkPreview,
  type ReaderIdentity,
  type FriendsView,
} from "./ReaderBackend";
import type { Offering } from "../state/social/discover";
import type { Contact } from "../state/social/today";
import { chapterOf } from "@seed/seed-protocol";
import { agentAddress } from "../state/records/marks";

export interface DevCall {
  op: "read" | "put" | "merge" | "list";
  key: string;
  opId?: string;
}

export interface DevBackend extends ReaderBackend {
  readonly buckets: Map<string, BucketDocument>;
  readonly calls: DevCall[];
  /** The in-memory registry: what was published and not withdrawn. */
  readonly registry: Map<string, Offering & { markdown: string }>;
  /** Contacts the fake Home reports. */
  contactList: Contact[];
  /** Friends the fake Home reports; when null, derived from the contacts (mutual ones are friends). */
  friendsView: FriendsView | null;
  /** The reader's works as the fake Library holds them, by `folder/name`. */
  readonly works: Map<string, unknown>;
  setIdentity(identity: ReaderIdentity | null): void;
  /** Make the next calls fail as if the network were down (until set back). */
  setOffline(offline: boolean): void;
}

const key = (collection: Collection, chapter?: string) =>
  `${collection}:${bucketKey(collection, chapter)}`;

export function createDevBackend(
  identity: ReaderIdentity | null = null
): DevBackend {
  const buckets = new Map<string, BucketDocument>();
  const calls: DevCall[] = [];
  const registry = new Map<string, Offering & { markdown: string }>();
  const works = new Map<string, unknown>();
  let who = identity;
  let offline = false;
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const guard = () => {
    if (offline)
      throw new BackendError(
        "the reader workspace could not be reached",
        "offline"
      );
    if (!who)
      throw new BackendError("sign in to keep your marks", "signed-out");
  };
  return {
    kind: "dev",
    buckets,
    calls,
    registry,
    contactList: [],
    friendsView: null,
    works,
    setIdentity: (i) => (who = i),
    setOffline: (o) => (offline = o),
    identity: () => who,
    async readBucket(collection, chapter) {
      guard();
      calls.push({ op: "read", key: key(collection, chapter) });
      return clone(
        buckets.get(key(collection, chapter)) ??
          emptyBucket(collection, chapter)
      );
    },
    async listBuckets(collection) {
      guard();
      calls.push({ op: "list", key: collection });
      const out: ManifestEntry[] = [];
      for (const [k, b] of buckets) {
        if (!k.startsWith(`${collection}:`)) continue;
        out.push({
          bucket: k.slice(collection.length + 1),
          version: 1,
          count: b["@graph"].length,
          updatedAt: new Date().toISOString(),
        });
      }
      return out;
    },
    async putMark(collection, item: BucketItem) {
      guard();
      const k = key(collection, item.aboutPassage);
      calls.push({ op: "put", key: k, opId: item.opId });
      const cur = buckets.get(k) ?? emptyBucket(collection, item.aboutPassage);
      const out = applyPut(cur, clone(item));
      buckets.set(k, out.bucket);
      return { changed: out.changed };
    },
    async mergeBucket(collection, chapter, incoming, opId) {
      guard();
      const k = key(collection, chapter);
      calls.push({ op: "merge", key: k, opId });
      if (
        incoming["@graph"].some(
          (it) => agentAddress(it.heldBy) !== agentAddress(who!.agent)
        )
      )
        throw new BackendError(
          "an item in the bucket is not held by the signed-in reader",
          "refused"
        );
      const cur = buckets.get(k) ?? emptyBucket(collection, chapter);
      const { bucket } = mergeBuckets(cur, clone(incoming));
      buckets.set(k, bucket);
      return clone(bucket);
    },
    async discover(q) {
      if (offline)
        throw new BackendError(
          "the reader workspace could not be reached",
          "offline"
        );
      const rows = [...registry.values()];
      const hit = q.owners?.length
        ? rows.filter((o) =>
            q.owners!.some(
              (x) => x.toLowerCase() === o.owner || x.toLowerCase() === o.shelf
            )
          )
        : q.passage
          ? rows.filter(
              (o) =>
                o.passage !== "*" &&
                chapterOf(o.passage) === chapterOf(q.passage ?? "") &&
                (!q.kind || o.kind === q.kind)
            )
          : rows.filter((o) => o.kind === q.kind);
      return clone(
        hit
          .sort((a, b) => b.indexedAt.localeCompare(a.indexedAt))
          .map(({ markdown: _m, ...o }) => o)
      );
    },
    async publishSlice(args: PublishSliceArgs) {
      guard();
      const slug =
        args.slug ?? args.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const descriptorId = `urn:seed:offering:${who!.agent.toLowerCase()}:${args.kind}:${slug}`;
      registry.set(descriptorId, {
        owner: who!.agent.toLowerCase(),
        shelf: `${who!.name.toLowerCase().replace(/\s+/g, "")}.me`,
        entryId: `e-${slug}`,
        version: (registry.get(descriptorId)?.version ?? 0) + 1,
        passage: args.passage ?? "*",
        kind: args.kind,
        title: args.title,
        descriptorId,
        descriptor: { "@id": descriptorId, ...(args.descriptor ?? {}) },
        markdownPath: `seed-bible/public/${args.kind}/${slug}.md`,
        indexedAt: new Date().toISOString(),
        markdown: args.markdown,
      });
      return { descriptorId, slug };
    },
    async withdrawSlice(kind, slug) {
      guard();
      registry.delete(
        `urn:seed:offering:${who!.agent.toLowerCase()}:${kind}:${slug}`
      );
    },
    async readPublic(shelf, path) {
      const o = [...registry.values()].find(
        (x) => x.shelf === shelf && x.markdownPath === path
      );
      if (!o) throw new BackendError("not public", "refused");
      return o.markdown;
    },
    async contacts() {
      guard();
      return clone(this.contactList);
    },
    async friends() {
      guard();
      if (this.friendsView) return clone(this.friendsView);
      const people = this.contactList.filter(
        (c) => (c.status ?? "active") !== "removed"
      );
      const row = (c: Contact) => ({
        agent: c.contact,
        name: c.name,
        ...(c.since ? { since: c.since } : {}),
      });
      return {
        friends: people.filter((c) => c.mutual === true).map(row),
        requests: [],
        requested: people.filter((c) => c.mutual !== true).map(row),
      };
    },
    async listWorks(folder: WorkFolder): Promise<WorkEntry[]> {
      guard();
      return [...works.keys()]
        .filter((k) => k.startsWith(`${who!.agent.toLowerCase()}:${folder}/`))
        .map((k) => ({ name: k.slice(k.lastIndexOf("/") + 1), id: k }));
    },
    async readWork(folder: WorkFolder, name: string): Promise<unknown> {
      guard();
      const doc = works.get(`${who!.agent.toLowerCase()}:${folder}/${name}`);
      if (doc === undefined) throw new BackendError("no such work", "refused");
      return clone(doc);
    },
    async saveWork(
      folder: WorkFolder,
      name: string,
      doc: unknown
    ): Promise<{ id?: string }> {
      guard();
      const k = `${who!.agent.toLowerCase()}:${folder}/${name}`;
      works.set(k, clone(doc));
      return { id: k };
    },
    async uploadFile(_name, contentType, bytes): Promise<UploadedFile> {
      guard();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        bytes.slice().buffer as ArrayBuffer
      );
      const sha256 = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return {
        url: `https://files.test/${who!.agent.toLowerCase()}/${sha256}`,
        sha256,
        contentType,
        size: bytes.byteLength,
      };
    },
    async linkPreview(url): Promise<LinkPreview> {
      return {
        url,
        title: `Preview of ${new URL(url).hostname}`,
        description: "a fake preview",
      };
    },
    async sessionStart(): Promise<SessionTicket> {
      guard();
      return {
        sessionId: crypto.randomUUID(),
        token: "dev-token",
        role: "leader",
        code: "DEVCODE",
        recordRef: null,
      };
    },
    async sessionJoin(sessionId, code): Promise<SessionTicket> {
      guard();
      if (code !== "DEVCODE")
        throw new BackendError("no standing in this session", "refused");
      return { sessionId, token: "dev-token", role: "reader" };
    },
  };
}
