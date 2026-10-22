// THE LIVE BACKEND — one harness run on reader-a2a per call, as the signed-in reader (the id_token is the
// session; the workspace plans the pinned `skill:seed/*` skill and the reader's own agent does the Library work).
// reader-a2a never writes a person's record itself; a stranger is refused in words (BackendError "signed-out").
import type {
  BucketDocument,
  Collection,
  ManifestEntry,
} from "@seed/library-client";
import type { BucketItem } from "@seed/seed-schema";
import { A2A_BASE } from "../api";
import type { ReaderSession } from "../session";
import {
  BackendError,
  type PublishReceipt,
  type PublishSliceArgs,
  type SessionPassageArgs,
  type SessionTicket,
  type WorkEntry,
  type WorkFolder,
  type UploadedFile,
  type LinkPreview,
  type ReaderBackend,
  type ReaderIdentity,
  type FriendsView,
  type FriendPresence,
} from "./ReaderBackend";
import type { Offering } from "../state/social/discover";
import type { Contact } from "../state/social/today";
import { agentAddress } from "../state/records/marks";

interface HarnessReply {
  ok: boolean;
  runRef?: string;
  reply?: {
    kind: string;
    text?: string;
    error?: string;
    results?: Array<{ toolId: string; result: unknown }>;
  };
  error?: string;
}

export function createA2aBackend(
  getSession: () => ReaderSession | null,
  fetchImpl: typeof fetch = (...a) => fetch(...a)
): ReaderBackend {
  const ask = async (
    toolId: string,
    args: Record<string, unknown>,
    message: string
  ): Promise<Record<string, unknown>> => {
    const s = getSession();
    if (!s) throw new BackendError("sign in to keep your marks", "signed-out");
    let res: Response;
    try {
      res = await fetchImpl(`${A2A_BASE}/harness/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session: s.token,
          message,
          plan: { steps: [{ id: "s1", toolId, args }] },
        }),
      });
    } catch {
      throw new BackendError(
        "the reader workspace could not be reached",
        "offline"
      );
    }
    const out = (await res.json().catch(() => null)) as HarnessReply | null;
    if (res.status === 401)
      throw new BackendError(
        out?.error ?? "your session is no longer valid",
        "signed-out"
      );
    if (!out)
      throw new BackendError(
        `the reader workspace answered HTTP ${res.status}`,
        "unavailable"
      );
    if (!out.ok || !out.reply)
      throw new BackendError(
        out.error ?? "the reader workspace did not answer",
        "unavailable"
      );
    if (out.reply.kind !== "answer")
      throw new BackendError(
        out.reply.error ??
          out.reply.text ??
          `the workspace replied ${out.reply.kind}`,
        "refused"
      );
    const first = out.reply.results?.[0]?.result;
    if (!first || typeof first !== "object")
      throw new BackendError(
        "the workspace answered without a result",
        "unavailable"
      );
    return first as Record<string, unknown>;
  };

  return {
    kind: "a2a",
    identity(): ReaderIdentity | null {
      const s = getSession();
      return s
        ? { agent: agentAddress(s.sub), name: s.name, wire: s.wire }
        : null;
    },
    async readBucket(collection, chapter) {
      const r = await ask(
        "seed.bucket.read",
        { collection, ...(chapter ? { chapter } : {}) },
        `read my ${collection}${chapter ? ` for ${chapter}` : ""}`
      );
      return r.bucket as BucketDocument;
    },
    async listBuckets(collection) {
      const r = await ask(
        "seed.bucket.list",
        { collection },
        `list my ${collection}`
      );
      return (Array.isArray(r.buckets) ? r.buckets : []) as ManifestEntry[];
    },
    async putMark(collection, item: BucketItem) {
      const r = await ask(
        `seed.${collection.slice(0, -1)}.put`,
        { item },
        `keep my ${collection.slice(0, -1)} on ${item.aboutPassage}`
      );
      return { changed: r.changed === true };
    },
    async mergeBucket(collection, chapter, incoming, opId) {
      const r = await ask(
        "seed.bucket.merge",
        { collection, ...(chapter ? { chapter } : {}), incoming, opId },
        `merge my ${collection}${chapter ? ` for ${chapter}` : ""} from this device`
      );
      // A workspace from before the receipt carried the bucket: read it back.
      return r.bucket && typeof r.bucket === "object"
        ? (r.bucket as BucketDocument)
        : this.readBucket(collection, chapter);
    },
    async discover(q) {
      const r = await ask(
        "seed.workspace.discover",
        q.owners?.length
          ? { owners: q.owners }
          : { passage: q.passage ?? "", ...(q.kind ? { kind: q.kind } : {}) },
        q.owners?.length
          ? "what did they release recently"
          : `what is there for ${q.passage}`
      );
      return (r.offerings as Offering[] | undefined) ?? [];
    },
    async publishSlice(args: PublishSliceArgs): Promise<PublishReceipt> {
      const r = await ask(
        "seed.publish.slice",
        { ...args },
        `publish my ${args.kind}${args.passage ? ` on ${args.passage}` : ""}`
      );
      if (r.published !== true)
        throw new BackendError(
          String(r.refused ?? "the slice was not published"),
          "refused"
        );
      return {
        descriptorId: String(r.descriptorId ?? ""),
        slug: String(r.slug ?? args.slug ?? ""),
      };
    },
    async withdrawSlice(kind, slug) {
      const r = await ask(
        "seed.publish.slice",
        { withdraw: { kind, slug } },
        `take my ${kind} ${slug} off my shelf`
      );
      if (r.withdrawn !== true)
        throw new BackendError(
          String(r.refused ?? "the slice was not withdrawn"),
          "refused"
        );
    },
    async readPublic(shelf, path) {
      let res: Response;
      try {
        res = await fetchImpl(
          `${A2A_BASE}/api/public/read?shelf=${encodeURIComponent(shelf)}&path=${encodeURIComponent(path)}`
        );
      } catch {
        throw new BackendError(
          "the reader workspace could not be reached",
          "offline"
        );
      }
      const out = (await res.json().catch(() => null)) as {
        ok?: boolean;
        text?: string;
        error?: string;
      } | null;
      if (!out?.ok)
        throw new BackendError(
          out?.error ?? `HTTP ${res.status}`,
          res.status === 404 ? "refused" : "unavailable"
        );
      return out.text ?? "";
    },
    async contacts() {
      const r = await ask("seed.workspace.contacts", {}, "who are my contacts");
      return (r.contacts as Contact[] | undefined) ?? [];
    },
    async presenceBeat(beat) {
      const s = getSession();
      if (!s) return;
      await fetchImpl(`${A2A_BASE}/api/presence/beat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${s.token}`,
        },
        body: JSON.stringify(beat),
        keepalive: true,
      }).catch(() => undefined);
    },
    async presenceFriends() {
      const s = getSession();
      if (!s) return [];
      const res = await fetchImpl(`${A2A_BASE}/api/presence/friends`, {
        headers: { authorization: `Bearer ${s.token}` },
      });
      const out = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        friends?: FriendPresence[];
      } | null;
      if (!res.ok || !out?.ok)
        throw new BackendError(
          out?.error ?? `presence answered ${res.status}`,
          res.status === 401 ? "signed-out" : "unavailable"
        );
      return out.friends ?? [];
    },
    async friends() {
      const r = await ask("seed.workspace.friends", {}, "who are my friends");
      return {
        friends: (r.friends as FriendsView["friends"] | undefined) ?? [],
        requests: (r.requests as FriendsView["requests"] | undefined) ?? [],
        requested: (r.requested as FriendsView["requested"] | undefined) ?? [],
      };
    },
    async sessionStart(passage: SessionPassageArgs): Promise<SessionTicket> {
      const r = await ask(
        "seed.session.start",
        { ...passage },
        `start a reading session on ${passage.bookId} ${passage.chapterNumber}`
      );
      return r as unknown as SessionTicket;
    },
    async listWorks(folder: WorkFolder): Promise<WorkEntry[]> {
      const r = await ask("seed.work.list", { folder }, `list my ${folder}`);
      return (r.files as WorkEntry[] | undefined) ?? [];
    },
    async readWork(folder: WorkFolder, name: string): Promise<unknown> {
      const r = await ask(
        "seed.work.read",
        { folder, name },
        `read my work ${name}`
      );
      return r.doc;
    },
    async saveWork(
      folder: WorkFolder,
      name: string,
      doc: unknown,
      id?: string
    ): Promise<{ id?: string }> {
      const r = await ask(
        "seed.work.save",
        { folder, name, doc, ...(id ? { id } : {}) },
        `keep my work ${name}`
      );
      const file = r.file as { id?: string } | undefined;
      return { ...(file?.id ? { id: file.id } : {}) };
    },
    async uploadFile(name, contentType, bytes): Promise<UploadedFile> {
      let bin = "";
      for (let i = 0; i < bytes.byteLength; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await ask(
        "seed.file.put",
        { name, contentType, dataBase64: btoa(bin) },
        `keep the file ${name}`
      );
      return {
        url: String(r.url ?? ""),
        sha256: String(r.sha256 ?? ""),
        contentType: String(r.contentType ?? contentType),
        size: Number(r.size ?? bytes.byteLength),
      };
    },
    async linkPreview(url): Promise<LinkPreview> {
      const r = await ask("seed.workspace.preview", { url }, `preview ${url}`);
      const pick = (k: string) =>
        typeof r[k] === "string" ? { [k]: r[k] as string } : {};
      return {
        url,
        ...pick("title"),
        ...pick("description"),
        ...pick("image"),
        ...pick("siteName"),
      };
    },
    async sessionJoin(sessionId, code): Promise<SessionTicket> {
      const r = await ask(
        "seed.session.join",
        { sessionId, ...(code ? { code } : {}) },
        `join session ${sessionId}`
      );
      return r as unknown as SessionTicket;
    },
  };
}
