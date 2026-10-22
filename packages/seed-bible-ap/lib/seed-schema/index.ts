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
  xsd: "http://www.w3.org/2001/XMLSchema#",
  label: "rdfs:label",
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
  createdAt: { "@id": "seed:createdAt", "@type": "xsd:dateTime" },
  updatedAt: { "@id": "seed:updatedAt", "@type": "xsd:dateTime" },
  startedAt: { "@id": "seed:startedAt", "@type": "xsd:dateTime" },
  endedAt: { "@id": "seed:endedAt", "@type": "xsd:dateTime" },
} as const;

/** Keys that are NOT `seed:` properties — mapped by the context; the TTL test allows exactly these. */
export const NON_SEED_KEYS: Readonly<Record<string, string>> = {
  label: "rdfs:label",
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
} as const;
export type SeedClass = keyof typeof SCHEMAS;
