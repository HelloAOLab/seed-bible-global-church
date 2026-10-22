// THE RECORD SHAPES — one zod schema per `seed:` class this package writes, mirroring ~/skills/ontology/seed.ttl
// (the T-box is the source; `test/unit/lib/seed-schema.ttl.test.ts` checks every key here is a declared property).
// A record is a Library artifact: JSON-LD with this context, `@type` a `seed:` class, keys the ontology's local names.
// The text is never here — a mark points at a passage (OSIS) in an edition.
import { z } from "zod";

export const SEED_NS = "https://skills.demo/seed#";
export const SCR_NS = "https://skills.demo/scripture#";

/** The JSON-LD context every bucket, manifest and published descriptor carries. */
export const SEED_CONTEXT = {
  "@vocab": SEED_NS,
  seed: SEED_NS,
  scr: SCR_NS,
  at: "https://agentictrustlabs.dev/ns/agentic-trust#",
  prov: "http://www.w3.org/ns/prov#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  schema: "https://schema.org/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  label: "rdfs:label",
  description: "schema:description",
  url: { "@id": "schema:url", "@type": "@id" },
  wasAssociatedWith: { "@id": "prov:wasAssociatedWith", "@type": "@id" },
  heldBy: { "@id": "seed:heldBy", "@type": "@id" },
  publishedBy: { "@id": "seed:publishedBy", "@type": "@id" },
  aboutPassage: { "@id": "seed:aboutPassage", "@type": "@id" },
  offeredForPassage: { "@id": "seed:offeredForPassage", "@type": "@id" },
  ofEdition: { "@id": "seed:ofEdition", "@type": "@id" },
  highlightColor: { "@id": "seed:highlightColor", "@type": "@id" },
  offeringKind: { "@id": "seed:offeringKind", "@type": "@id" },
  visibility: { "@id": "seed:visibility", "@type": "@id" },
  replyTo: { "@id": "seed:replyTo", "@type": "@id" },
  conflictOf: { "@id": "seed:conflictOf", "@type": "@id" },
  supersedes: "seed:supersedes",
  hasItem: "seed:hasItem",
  hasSession: "seed:hasSession",
  progressOf: { "@id": "seed:progressOf", "@type": "@id" },
  heroImage: { "@id": "seed:heroImage", "@type": "@id" },
  completedAt: { "@id": "seed:completedAt", "@type": "xsd:dateTime" },
  createdAt: { "@id": "seed:createdAt", "@type": "xsd:dateTime" },
  updatedAt: { "@id": "seed:updatedAt", "@type": "xsd:dateTime" },
  startedAt: { "@id": "seed:startedAt", "@type": "xsd:dateTime" },
  endedAt: { "@id": "seed:endedAt", "@type": "xsd:dateTime" },
} as const;

/** Keys that are NOT `seed:` properties — mapped by the context; the TTL test allows exactly these. */
export const NON_SEED_KEYS: Readonly<Record<string, string>> = {
  label: "rdfs:label",
  description: "schema:description",
  url: "schema:url",
  wasAssociatedWith: "prov:wasAssociatedWith",
};

export const HIGHLIGHT_COLORS = [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
  "purple",
] as const;
export const OFFERING_KINDS = [
  "video",
  "article",
  "episode",
  "study",
  "note",
  "playlist",
  "plan",
  "image",
] as const;
export const VISIBILITIES = ["world", "friends", "private"] as const;

/** A controlled-list value as the data graph writes it: `seed:highlightcolor-yellow`. */
export const conceptIri = (
  vocab: "highlightcolor" | "offeringkind" | "visibility" | "sessionrole",
  notation: string
) => `seed:${vocab}-${notation}`;

const iso = z.string().datetime({ offset: true });
/** An agent's CAIP-10 id or address — `eip155:34348:0x…` or `0x…`. */
const agentRef = z.string().regex(/^(eip155:\d+:)?0x[0-9a-fA-F]{40}$/);
/** An OSIS reference: `JHN.3`, `JHN.3.16`, `JHN.3.16-JHN.3.18`. */
export const osisRef = z
  .string()
  .regex(/^[1-4]?[A-Z]{2,3}(\.\d+){0,2}(-[1-4]?[A-Z]{2,3}(\.\d+){0,2})?$/);

const mark = {
  "@id": z.string().min(1),
  heldBy: agentRef,
  aboutPassage: osisRef,
  ofEdition: z.string().min(1).optional(),
  opId: z.string().min(1),
  createdAt: iso.optional(),
  updatedAt: iso.optional(),
  /** A tombstone keeps its id and opId so a later merge can see the deletion (bucket-merge). */
  deleted: z.boolean().optional(),
  /** The opId this write was edited from — a merge that finds the current opId here sees a plain update. */
  supersedes: z.string().min(1).optional(),
};

export const Highlight = z.object({
  ...mark,
  "@type": z.literal("seed:Highlight"),
  highlightColor: z.enum(
    HIGHLIGHT_COLORS.map((c) => conceptIri("highlightcolor", c)) as [
      string,
      ...string[],
    ]
  ),
});
export type Highlight = z.infer<typeof Highlight>;

export const Annotation = z.object({
  ...mark,
  "@type": z.literal("seed:Annotation"),
  note: z.string().min(1),
  tag: z.array(z.string()).optional(),
  replyTo: z.string().optional(),
  conflictOf: z.string().optional(),
});
export type Annotation = z.infer<typeof Annotation>;

export const Bookmark = z.object({
  ...mark,
  "@type": z.literal("seed:Bookmark"),
  bookmarkName: z.string().min(1),
});
export type Bookmark = z.infer<typeof Bookmark>;

export const Save = z.object({
  ...mark,
  "@type": z.literal("seed:Save"),
  label: z.string().optional(),
});
export type Save = z.infer<typeof Save>;

export const ReadingPosition = z.object({
  "@id": z.string().min(1),
  "@type": z.literal("seed:ReadingPosition"),
  heldBy: agentRef,
  aboutPassage: osisRef,
  ofEdition: z.string().min(1),
  updatedAt: iso,
});
export type ReadingPosition = z.infer<typeof ReadingPosition>;

export const ReadingEvent = z.object({
  "@id": z.string().min(1),
  "@type": z.literal("seed:ReadingEvent"),
  wasAssociatedWith: agentRef,
  aboutPassage: osisRef,
  ofEdition: z.string().min(1).optional(),
  startedAt: iso,
  endedAt: iso.optional(),
});
export type ReadingEvent = z.infer<typeof ReadingEvent>;

// ── Works: playlists and reading plans (Library documents, not bucket items) and plan progress (a bucket item) ──
export const ScriptureItem = z.object({
  "@type": z.literal("seed:ScriptureItem"),
  aboutPassage: osisRef,
  ofEdition: z.string().min(1).optional(),
  note: z.string().optional(),
  noteTitle: z.string().optional(),
});
export const HtmlItem = z.object({
  "@type": z.literal("seed:HtmlItem"),
  label: z.string().optional(),
  html: z.string().min(1),
});
export const LinkItem = z.object({
  "@type": z.literal("seed:LinkItem"),
  label: z.string().optional(),
  url: z.string().url(),
  embed: z.boolean().optional(),
});
export const PlaylistItem = z.discriminatedUnion("@type", [
  ScriptureItem,
  HtmlItem,
  LinkItem,
]);
export type PlaylistItem = z.infer<typeof PlaylistItem>;

const work = {
  "@id": z.string().min(1),
  publishedBy: agentRef,
  label: z.string().min(1),
  description: z.string().optional(),
  heroImage: z.string().url().optional(),
  createdAt: iso.optional(),
  updatedAt: iso.optional(),
  deleted: z.boolean().optional(),
};

export const Playlist = z.object({
  ...work,
  "@type": z.literal("seed:Playlist"),
  hasItem: z.array(PlaylistItem),
});
export type Playlist = z.infer<typeof Playlist>;

export const PlanReading = z.object({
  "@type": z.literal("seed:PlanReading"),
  "@id": z.string().min(1),
  item: PlaylistItem,
});
export const PlanSession = z.object({
  "@type": z.literal("seed:PlanSession"),
  "@id": z.string().min(1),
  label: z.string().optional(),
  note: z.string().optional(),
  readings: z.array(PlanReading),
});
export const CadenceOption = z.object({
  "@type": z.literal("seed:CadenceOption"),
  "@id": z.string().min(1),
  label: z.string().min(1),
  /** How many days each session takes at this cadence (1 = daily). 0 = self-paced. */
  daysPerSession: z.number().int().nonnegative(),
});
export const ReadingPlan = z.object({
  ...work,
  "@type": z.literal("seed:ReadingPlan"),
  hasSession: z.array(PlanSession),
  cadenceOptions: z.array(CadenceOption).min(1),
  defaultCadence: z.string().optional(),
});
export type ReadingPlan = z.infer<typeof ReadingPlan>;

export const SessionProgress = z.object({
  "@type": z.literal("seed:SessionProgress"),
  session: z.string().min(1),
  completed: z.array(z.string()),
  completedAt: iso.optional(),
});
export const PlanProgress = z.object({
  ...mark,
  "@type": z.literal("seed:PlanProgress"),
  progressOf: z.string().min(1),
  selectedCadence: z.string().optional(),
  selfPaced: z.boolean().optional(),
  startedAt: iso,
  sessions: z.array(SessionProgress),
});
export type PlanProgress = z.infer<typeof PlanProgress>;

export const Offering = z.object({
  "@id": z.string().min(1),
  "@type": z.literal("seed:Offering"),
  label: z.string().min(1),
  publishedBy: agentRef,
  offeredForPassage: osisRef,
  offeringKind: z.enum(
    OFFERING_KINDS.map((k) => conceptIri("offeringkind", k)) as [
      string,
      ...string[],
    ]
  ),
  visibility: z
    .enum(
      VISIBILITIES.map((v) => conceptIri("visibility", v)) as [
        string,
        ...string[],
      ]
    )
    .optional(),
});
export type Offering = z.infer<typeof Offering>;

/** Every record a bucket may hold, discriminated by `@type`. */
export const BucketItem = z.discriminatedUnion("@type", [
  PlanProgress,
  Highlight,
  Annotation,
  Bookmark,
  Save,
]);
export type BucketItem = z.infer<typeof BucketItem>;

/** The schema for a class name as the T-box spells it (`Highlight` → the zod schema). */
export const SCHEMAS = {
  Highlight,
  Annotation,
  Bookmark,
  Save,
  ReadingPosition,
  ReadingEvent,
  Offering,
  Playlist,
  ReadingPlan,
  PlanProgress,
} as const;
export type SeedClass = keyof typeof SCHEMAS;
