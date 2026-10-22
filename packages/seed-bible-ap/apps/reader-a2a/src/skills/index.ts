// THE WORKSPACE'S SKILLS — one tool per capability the planner may choose, each the dotted id a SKILL.md in
// ~/skills/skills/seed declares (`pins/skills.json` pins the digests). The act tools put the reader's marks into
// THEIR Library over the wire they signed (skills/vault.ts); none of them writes as the workspace.
import type { ToolSpec, ToolInvoker } from "@agenticprimitives/orchestration";
import type { AdmittedPrincipal } from "@agenticprimitives/service-host";
import { WireRefusal } from "../wires";
import {
  mergeBucket,
  putMark,
  readBucket,
  readManifest,
  agentFor,
  setDefer,
  type Defer,
  type VaultEnv,
} from "./vault";
import { publishSlice, withdrawSlice, type PublishArgs } from "./publish";
import {
  platformGet,
  platformSend,
  type PlatformEnv,
} from "../clients/platform";
import {
  SESSION_JOIN,
  SESSION_RECORD,
  SESSION_START,
  joinSession,
  sessionRecord,
  startSession,
  type RoomsEnv,
} from "./session";
import {
  listStep,
  readStep,
  saveJsonLdStep,
  type Collection,
  type LibraryList,
  type LibraryRead,
  type LibrarySaved,
} from "../../../../lib/library-client";

export const HELLO_TOOL: ToolSpec = {
  id: "seed.hello",
  description:
    "Says hello to whoever is asking and names the reader workspace. Args: name (optional — the signed-in reader's name is used when present).",
  inputSchema: { type: "object", properties: { name: { type: "string" } } },
  answers: ["hello", "say hello", "who am I here"],
  establishes: "lookup",
};

const mark = (collection: Collection, what: string): ToolSpec => ({
  id: `seed.${collection.slice(0, -1).replace("annotation", "annotation")}.put`,
  description: `Puts ONE ${what} into the signed-in reader's own Library (seed-bible/${collection}/, the chapter's bucket), idempotent by opId. Args: item (the seed:${what} JSON-LD record: @id, @type, heldBy, aboutPassage, opId, …).`,
  inputSchema: {
    type: "object",
    properties: { item: { type: "object" } },
    required: ["item"],
  },
  answers: [`keep my ${what}`, `save this ${what}`],
});

export const HIGHLIGHT_PUT: ToolSpec = mark("highlights", "Highlight");
export const ANNOTATION_PUT: ToolSpec = mark("annotations", "Annotation");
export const BOOKMARK_PUT: ToolSpec = mark("bookmarks", "Bookmark");
// `seed.save.put` waits for its SKILL.md in ~/skills (the first set has no save-put); a tool with no pinned skill is not offered.

export const BUCKET_READ: ToolSpec = {
  id: "seed.bucket.read",
  description:
    "Reads one of the signed-in reader's chapter buckets from their Library as evidence (what the app syncs from). Args: collection (highlights · annotations · bookmarks · saves · progress · history), chapter (OSIS, for highlights/annotations/history).",
  inputSchema: {
    type: "object",
    properties: { collection: { type: "string" }, chapter: { type: "string" } },
    required: ["collection"],
  },
  answers: ["what did I highlight in this chapter", "my notes on this chapter"],
  establishes: "lookup",
};

export const BUCKET_LIST: ToolSpec = {
  id: "seed.bucket.list",
  description:
    "Lists the signed-in reader's buckets of one collection from the collection's manifest in their Library — which chapters hold marks or reads, each bucket's version, count and last update — so a device can fetch what it never opened. Args: collection.",
  inputSchema: {
    type: "object",
    properties: { collection: { type: "string" } },
    required: ["collection"],
  },
  answers: ["which chapters have I highlighted", "what have I read"],
  establishes: "lookup",
};

export const BUCKET_MERGE: ToolSpec = {
  id: "seed.bucket.merge",
  description:
    "Merges a bucket a device brings into the reader's at the item level (later update wins; a note edited on both sides is kept twice and flagged), then saves it. Args: collection, chapter (OSIS, for highlights/annotations), incoming (the device's bucket document), opId.",
  inputSchema: {
    type: "object",
    properties: {
      collection: { type: "string" },
      chapter: { type: "string" },
      incoming: { type: "object" },
      opId: { type: "string" },
    },
    required: ["collection", "incoming", "opId"],
  },
  answers: ["sync what I marked offline", "merge my phone's notes"],
};

export const PUBLISH_SLICE: ToolSpec = {
  id: "seed.publish.slice",
  description:
    "Makes ONE slice of the signed-in reader's Library public on their shelf as a seed:Offering — a note on a chapter, a playlist, a plan — by saving the descriptor and a markdown rendering public and minting a signed release of each; the Seed registry indexes it by passage. Args: kind (note · study · playlist · plan · …), passage (OSIS), title, markdown, slug (optional), descriptor (optional extras); or { withdraw: { kind, slug } } to take it off the shelf.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string" },
      passage: { type: "string" },
      title: { type: "string" },
      markdown: { type: "string" },
      slug: { type: "string" },
      descriptor: { type: "object" },
      withdraw: { type: "object" },
    },
  },
  answers: [
    "publish this note",
    "share this with everyone",
    "make this playlist public",
    "take this off my shelf",
  ],
};

export const DISCOVER: ToolSpec = {
  id: "seed.workspace.discover",
  description:
    "What Seed Bible agents released, from the Seed registry on seed-bible.svc (offerings, studies, published notes, playlists, plans). Args: passage (OSIS; a verse narrows to its chapter) and kind (optional) — or owners (agent addresses or shelf names) for their recent releases, newest first.",
  inputSchema: {
    type: "object",
    properties: {
      passage: { type: "string" },
      kind: { type: "string" },
      owners: { type: "array", items: { type: "string" } },
    },
  },
  answers: [
    "what is there for this chapter",
    "discover John 3",
    "studies on this passage",
  ],
  establishes: "lookup",
};

// The reader's own works — playlists and reading plans — as private Library documents under their own folders.
const WORK_FOLDERS: ReadonlySet<string> = new Set([
  "seed-bible/playlists",
  "seed-bible/plans",
  "seed-bible/files",
  "seed-bible/customizations",
]);
const workFolderOf = (raw: unknown): string => {
  const f = String(raw ?? "");
  if (!WORK_FOLDERS.has(f))
    throw new WireRefusal(400, `not a work folder: ${f}`);
  return f;
};
const workNameOf = (raw: unknown): string => {
  const n = String(raw ?? "");
  if (!/^[a-z0-9][a-z0-9-]{0,80}\.jsonld$/i.test(n))
    throw new WireRefusal(400, "a work is named <id>.jsonld");
  return n;
};

export const WORK_SAVE: ToolSpec = {
  id: "seed.work.save",
  description:
    "Saves one of the signed-in reader's works — a seed:Playlist or seed:ReadingPlan JSON-LD document — privately in their Library (seed-bible/playlists or seed-bible/plans). Args: folder, name (<id>.jsonld), doc, id (the Library file id from an earlier save or list — saves a new version without a read).",
  inputSchema: {
    type: "object",
    properties: {
      folder: { type: "string" },
      name: { type: "string" },
      doc: { type: "object" },
      id: { type: "string" },
    },
    required: ["folder", "name", "doc"],
  },
  answers: ["save my playlist", "keep this reading plan"],
};
export const WORK_LIST: ToolSpec = {
  id: "seed.work.list",
  description:
    "Lists the signed-in reader's works in a folder (seed-bible/playlists or seed-bible/plans). Args: folder.",
  inputSchema: {
    type: "object",
    properties: { folder: { type: "string" } },
    required: ["folder"],
  },
  answers: ["my playlists", "my reading plans"],
  establishes: "lookup",
};
export const WORK_READ: ToolSpec = {
  id: "seed.work.read",
  description: "Reads one of the signed-in reader's works. Args: folder, name.",
  inputSchema: {
    type: "object",
    properties: { folder: { type: "string" }, name: { type: "string" } },
    required: ["folder", "name"],
  },
  answers: ["open my playlist"],
  establishes: "lookup",
};

export const FILE_PUT: ToolSpec = {
  id: "seed.file.put",
  description:
    "Puts a file's bytes (an image for a playlist cover or a photo) on the serving plane under the signed-in reader's address, content-addressed; the catalog entry (seed:GalleryImage) is the reader's to keep. Args: name, contentType, dataBase64 (≤ 5 MB).",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      contentType: { type: "string" },
      dataBase64: { type: "string" },
    },
    required: ["name", "contentType", "dataBase64"],
  },
  answers: ["upload this picture", "set a cover image"],
};
export const PREVIEW: ToolSpec = {
  id: "seed.workspace.preview",
  description:
    "A link's preview (title, description, image) read by the serving plane. Args: url.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
  answers: ["what is this link"],
  establishes: "lookup",
};

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

export const CONTACTS: ToolSpec = {
  id: "seed.workspace.contacts",
  description:
    "The signed-in reader's contacts, read from their own agent (the Home's person.contact.list) over the ask-as-me wire — who their Today feed follows. No args.",
  inputSchema: { type: "object", properties: {} },
  answers: ["who are my friends here", "my contacts"],
  establishes: "lookup",
};

export const TOOLS: ToolSpec[] = [
  HELLO_TOOL,
  HIGHLIGHT_PUT,
  ANNOTATION_PUT,
  BOOKMARK_PUT,
  BUCKET_READ,
  BUCKET_LIST,
  BUCKET_MERGE,
  PUBLISH_SLICE,
  DISCOVER,
  CONTACTS,
  SESSION_START,
  SESSION_JOIN,
  SESSION_RECORD,
  WORK_SAVE,
  WORK_LIST,
  WORK_READ,
  FILE_PUT,
  PREVIEW,
];

const COLLECTIONS: ReadonlySet<string> = new Set([
  "highlights",
  "annotations",
  "bookmarks",
  "saves",
  "progress",
  "history",
]);
const collectionOf = (raw: unknown): Collection => {
  const c = String(raw ?? "");
  if (!COLLECTIONS.has(c)) throw new Error(`unknown collection: ${c}`);
  return c as Collection;
};

export interface SkillDeps {
  env: VaultEnv & PlatformEnv & RoomsEnv;
  hello: (
    name: string | undefined
  ) => Promise<{ greeting: string; workspace: string }>;
  /** The signed-in reader's name, when the bearer carried one. */
  askerName?: string;
  /** The request's waitUntil: bookkeeping runs after the reply. */
  defer?: Defer;
}

/** Every act needs a signed-in reader; a stranger is refused in words, never served someone else's Library. */
function readerOf(asker: AdmittedPrincipal): string {
  if (asker.credential.kind === "public")
    throw new WireRefusal(
      401,
      "sign in with your Home to keep marks in your Library"
    );
  return asker.agent.toLowerCase();
}

export function invokers(
  deps: SkillDeps,
  asker: AdmittedPrincipal
): Record<string, ToolInvoker> {
  setDefer(deps.defer ?? null);
  const putter =
    (collection: Collection): ToolInvoker =>
    async (_t, args) =>
      putMark(deps.env, readerOf(asker), collection, args.item);
  return {
    [HELLO_TOOL.id]: async (_t, args) => {
      const name =
        typeof args.name === "string" && args.name.trim()
          ? args.name.trim()
          : deps.askerName;
      const out = await deps.hello(name);
      return {
        ...out,
        text: out.greeting,
        asker: asker.credential.kind === "public" ? "a stranger" : asker.agent,
        source: "seed-reader.workspace",
      };
    },
    [HIGHLIGHT_PUT.id]: putter("highlights"),
    [ANNOTATION_PUT.id]: putter("annotations"),
    [BOOKMARK_PUT.id]: putter("bookmarks"),
    [BUCKET_READ.id]: async (_t, args) => {
      const reader = readerOf(asker);
      const collection = collectionOf(args.collection);
      const chapter =
        typeof args.chapter === "string" ? args.chapter : undefined;
      const agent = await agentFor(deps.env, reader);
      const { bucket, file, runRef } = await readBucket(
        agent,
        collection,
        chapter
      );
      return {
        collection,
        chapter: chapter ?? null,
        file: file ?? null,
        bucket,
        runRef,
      };
    },
    [BUCKET_LIST.id]: async (_t, args) => {
      const reader = readerOf(asker);
      const collection = collectionOf(args.collection);
      const agent = await agentFor(deps.env, reader);
      const { manifest } = await readManifest(agent, collection);
      return {
        collection,
        buckets: Object.values(manifest.buckets),
        updatedAt: manifest.updatedAt,
      };
    },
    [PUBLISH_SLICE.id]: async (_t, args) => {
      const reader = readerOf(asker);
      const w = args.withdraw as { kind?: string; slug?: string } | undefined;
      if (w && typeof w === "object")
        return withdrawSlice(deps.env, reader, {
          kind: String(w.kind ?? ""),
          slug: String(w.slug ?? ""),
        });
      return publishSlice(deps.env, reader, args as unknown as PublishArgs);
    },
    [WORK_SAVE.id]: async (_t, args) => {
      const reader = readerOf(asker);
      const folder = workFolderOf(args.folder);
      const name = workNameOf(args.name);
      const agent = await agentFor(deps.env, reader);
      const known =
        typeof args.id === "string" && args.id ? args.id : undefined;
      const existing =
        known ??
        (await agent
          .run<LibraryRead>([readStep(folder, name)], `find ${folder}/${name}`)
          .then((o) =>
            o.result.read && o.result.file?.id ? o.result.file.id : undefined
          )
          .catch((e: unknown) => {
            if (
              e instanceof WireRefusal &&
              /no document named/i.test(e.message)
            )
              return undefined;
            throw e;
          }));
      const out = await agent.run<LibrarySaved>(
        [
          saveJsonLdStep(
            folder,
            name,
            JSON.stringify(args.doc ?? {}),
            existing,
            "private"
          ),
        ],
        `keep my work ${name}`
      );
      if (!out.result.saved || !out.result.file?.id)
        throw new WireRefusal(
          502,
          out.result.refused ?? `your agent did not save ${folder}/${name}`
        );
      return {
        saved: true,
        folder,
        name,
        file: out.result.file,
        runRef: out.runRef,
      };
    },
    [WORK_LIST.id]: async (_t, args) => {
      const reader = readerOf(asker);
      const folder = workFolderOf(args.folder);
      const agent = await agentFor(deps.env, reader);
      try {
        const out = await agent.run<LibraryList>(
          [listStep(folder)],
          `list my ${folder}`
        );
        return { folder, files: out.result.files ?? [], runRef: out.runRef };
      } catch (e) {
        if (e instanceof WireRefusal && /no (folder|document)/i.test(e.message))
          return { folder, files: [] };
        throw e;
      }
    },
    [WORK_READ.id]: async (_t, args) => {
      const reader = readerOf(asker);
      const folder = workFolderOf(args.folder);
      const name = workNameOf(args.name);
      const agent = await agentFor(deps.env, reader);
      const out = await agent.run<LibraryRead>(
        [readStep(folder, name)],
        `read my work ${name}`
      );
      if (!out.result.read)
        throw new WireRefusal(404, out.result.refused ?? "no such work");
      let doc: unknown = null;
      try {
        doc = JSON.parse(out.result.text ?? "null");
      } catch {
        throw new WireRefusal(502, "the work is not JSON");
      }
      return {
        folder,
        name,
        doc,
        file: out.result.file ?? null,
        runRef: out.runRef,
      };
    },
    [FILE_PUT.id]: async (_t, args) => {
      const reader = readerOf(asker);
      const contentType = String(args.contentType ?? "").toLowerCase();
      const ext = IMAGE_TYPES[contentType];
      if (!ext)
        throw new WireRefusal(
          400,
          `not a file kind the reader keeps: ${contentType}`
        );
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(String(args.dataBase64 ?? "")), (ch) =>
          ch.charCodeAt(0)
        );
      } catch {
        throw new WireRefusal(400, "dataBase64 is not base64");
      }
      if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024)
        throw new WireRefusal(413, "a file is 1 byte to 5 MB");
      const buf = bytes.slice().buffer as ArrayBuffer;
      const digest = await crypto.subtle.digest("SHA-256", buf);
      const sha256 = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const res = await platformSend(
        deps.env,
        `/files/${reader}/${sha256}.${ext}`,
        {
          method: "PUT",
          headers: {
            "content-type": contentType,
            "x-sb-upload-token": deps.env.PLATFORM_UPLOAD_TOKEN ?? "",
          },
          body: buf,
        }
      );
      const out = (await res.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        error?: string;
      } | null;
      if (!res.ok || !out?.ok || !out.url)
        throw new WireRefusal(
          502,
          out?.error ?? `the serving plane answered ${res.status}`
        );
      return {
        url: out.url,
        sha256,
        contentType,
        size: bytes.byteLength,
        name: String(args.name ?? ""),
        text: `Kept ${args.name} at ${out.url}`,
      };
    },
    [PREVIEW.id]: async (_t, args) => {
      const url = String(args.url ?? "");
      if (!/^https?:\/\//.test(url))
        throw new WireRefusal(400, "url must be http(s)");
      const out = await platformGet<Record<string, unknown>>(
        deps.env,
        `/preview?url=${encodeURIComponent(url)}`
      );
      return { ...out, text: String(out.title ?? url) };
    },
    [SESSION_START.id]: async (_t, args) => {
      const reader = readerOf(asker);
      return startSession(deps.env, reader, deps.askerName ?? reader, {
        translationId: String(args.translationId ?? ""),
        bookId: String(args.bookId ?? "").toUpperCase(),
        chapterNumber: Number(args.chapterNumber ?? 1),
      });
    },
    [SESSION_JOIN.id]: async (_t, args) => {
      const reader = readerOf(asker);
      return joinSession(
        deps.env,
        reader,
        deps.askerName ?? reader,
        String(args.sessionId ?? ""),
        typeof args.code === "string" ? args.code : undefined
      );
    },
    [SESSION_RECORD.id]: async (_t, args) =>
      sessionRecord(deps.env, readerOf(asker), String(args.sessionId ?? "")),
    [CONTACTS.id]: async () => {
      const reader = readerOf(asker);
      const agent = await agentFor(deps.env, reader);
      const out = await agent.run<{
        contacts?: Array<{
          contact: string;
          name: string | null;
          role?: string;
          status?: string;
          mutual?: boolean;
          since?: string;
        }>;
        refused?: string;
      }>([{ toolId: "person.contact.list", args: {} }], "who are my contacts");
      const contacts = out.result.contacts ?? [];
      return {
        contacts,
        count: contacts.length,
        runRef: out.runRef,
        text: contacts.length
          ? `${contacts.length} contact(s): ${contacts.map((c) => c.name ?? c.contact).join(", ")}`
          : "No contacts yet — add people at your Home.",
      };
    },
    [DISCOVER.id]: async (_t, args) => {
      if (Array.isArray(args.owners) && args.owners.length) {
        const owners = (args.owners as unknown[]).map(String).join(",");
        const out = await platformGet<{
          ok: boolean;
          count: number;
          offerings: Array<{ title: string; kind: string; shelf: string }>;
        }>(deps.env, `/registry/recent?owners=${encodeURIComponent(owners)}`);
        return {
          ...out,
          text: out.count
            ? `${out.count} recent release(s): ${out.offerings.map((o) => `${o.title} (${o.kind}, ${o.shelf})`).join("; ")}`
            : "Nothing released by them yet.",
        };
      }
      const passage = String(args.passage ?? "");
      if (!passage && typeof args.kind === "string") {
        const out = await platformGet<{
          ok: boolean;
          count: number;
          offerings: Array<{ title: string; kind: string; shelf: string }>;
        }>(
          deps.env,
          `/registry/offerings?kind=${encodeURIComponent(args.kind)}`
        );
        return {
          ...out,
          text: out.count
            ? `${out.count} ${args.kind}(s): ${out.offerings.map((o) => `${o.title} (${o.shelf})`).join("; ")}`
            : `No ${args.kind} released yet.`,
        };
      }
      const kind =
        typeof args.kind === "string"
          ? `&kind=${encodeURIComponent(args.kind)}`
          : "";
      const out = await platformGet<{
        ok: boolean;
        passage: string;
        count: number;
        offerings: Array<{ title: string; kind: string; shelf: string }>;
      }>(
        deps.env,
        `/registry/offerings?passage=${encodeURIComponent(passage)}${kind}`
      );
      return {
        ...out,
        text: out.count
          ? `${out.count} offering(s) for ${out.passage}: ${out.offerings.map((o) => `${o.title} (${o.kind}, ${o.shelf})`).join("; ")}`
          : `Nothing released for ${out.passage} yet.`,
      };
    },
    [BUCKET_MERGE.id]: async (_t, args) =>
      mergeBucket(
        deps.env,
        readerOf(asker),
        collectionOf(args.collection),
        typeof args.chapter === "string" ? args.chapter : undefined,
        args.incoming,
        String(args.opId ?? "")
      ),
  };
}
