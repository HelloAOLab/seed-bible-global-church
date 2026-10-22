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
  agentFor,
  type VaultEnv,
} from "./vault";
import type { Collection } from "../../../../lib/library-client";

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
    "Reads one of the signed-in reader's chapter buckets from their Library as evidence (what the app syncs from). Args: collection (highlights · annotations · bookmarks · saves), chapter (OSIS, for highlights/annotations).",
  inputSchema: {
    type: "object",
    properties: { collection: { type: "string" }, chapter: { type: "string" } },
    required: ["collection"],
  },
  answers: ["what did I highlight in this chapter", "my notes on this chapter"],
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

export const TOOLS: ToolSpec[] = [
  HELLO_TOOL,
  HIGHLIGHT_PUT,
  ANNOTATION_PUT,
  BOOKMARK_PUT,
  BUCKET_READ,
  BUCKET_MERGE,
];

const COLLECTIONS: ReadonlySet<string> = new Set([
  "highlights",
  "annotations",
  "bookmarks",
  "saves",
]);
const collectionOf = (raw: unknown): Collection => {
  const c = String(raw ?? "");
  if (!COLLECTIONS.has(c)) throw new Error(`unknown collection: ${c}`);
  return c as Collection;
};

export interface SkillDeps {
  env: VaultEnv;
  hello: (
    name: string | undefined
  ) => Promise<{ greeting: string; workspace: string }>;
  /** The signed-in reader's name, when the bearer carried one. */
  askerName?: string;
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
