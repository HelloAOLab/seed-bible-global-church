// THE READER'S FAITH LIFE — journey, prayers, care requests — kept by THEIR agent in THEIR vault as the faith
// ontology's typed records (person.faith.* on the Home runtime; ~/skills ontology/faith.ttl). This workspace only
// forwards one step over the reader's ask-as-me wire and passes back what their agent answered; it keeps nothing, and
// what anyone else may see is decided by their agent (person.faith.shared.view), never here.
import type { ToolSpec, ToolInvoker } from "@agenticprimitives/orchestration";
import { WireRefusal } from "../wires";
import { agentFor, type VaultEnv } from "./vault";

/** The person-runtime tool each workspace tool forwards to, and the arguments it may carry. */
const FORWARD = {
  "seed.faith.journey": { to: "person.faith.journey.get", args: [] },
  "seed.faith.journey.record": {
    to: "person.faith.journey.record",
    args: [
      "id",
      "stage",
      "milestone",
      "occurredOn",
      "place",
      "note",
      "visibility",
      "sharedWith",
      "remove",
    ],
  },
  "seed.faith.prayers": { to: "person.faith.prayers.list", args: ["status"] },
  "seed.faith.prayer.save": {
    to: "person.faith.prayer.save",
    args: [
      "id",
      "label",
      "description",
      "kind",
      "prayingFor",
      "passage",
      "visibility",
      "sharedWith",
      "prayed",
      "answered",
      "status",
      "remove",
    ],
  },
  "seed.faith.care.request": {
    to: "person.faith.care.request",
    args: [
      "id",
      "label",
      "description",
      "urgency",
      "safeToText",
      "church",
      "withdraw",
    ],
  },
  "seed.faith.shared": {
    to: "person.faith.shared.view",
    args: ["audience", "church", "friend", "purpose"],
  },
  // The churches the reader belongs to, from their own links — who a prayer or a care request can be shared with.
  "seed.faith.churches": {
    to: "person.affiliations.list",
    args: [],
    fixed: { type: "church" },
  },
} as const;
type FaithToolId = keyof typeof FORWARD;

const spec = (
  id: FaithToolId,
  description: string,
  act: boolean,
  answers: string[]
): ToolSpec => ({
  id,
  description,
  inputSchema: {
    type: "object",
    properties: Object.fromEntries(
      FORWARD[id].args.map((a) => [a, { type: "string" }])
    ),
  },
  answers,
  ...(act ? {} : { establishes: "lookup" as const }),
});

export const FAITH_TOOLS: ToolSpec[] = [
  spec(
    "seed.faith.journey",
    "The signed-in reader's faith journey — the stage they last said, its history, their milestones and next steps — from their own agent (person.faith.journey.get). No args.",
    false,
    ["my faith journey", "my next step"]
  ),
  spec(
    "seed.faith.journey.record",
    "Records a stage or a milestone of the signed-in reader's faith journey in their own vault, by their agent (person.faith.journey.record). Args: stage | milestone (+ occurredOn, place, note), visibility, sharedWith; or remove: <id>.",
    true,
    ["I was baptized", "I am a new believer"]
  ),
  spec(
    "seed.faith.prayers",
    "The signed-in reader's Care & Prayer list — prayers with status and answers, and care requests — from their own agent (person.faith.prayers.list). Args: status (optional).",
    false,
    ["my prayers", "answered prayers"]
  ),
  spec(
    "seed.faith.prayer.save",
    "Keeps one of the signed-in reader's prayers in their own vault, by their agent (person.faith.prayer.save): add or edit, prayed: yes, answered: <their words>, status, visibility, sharedWith, remove: yes.",
    true,
    ["add a prayer", "my prayer was answered"]
  ),
  spec(
    "seed.faith.care.request",
    "Keeps the signed-in reader's request for pastoral care for their church's leaders, by their agent (person.faith.care.request). Args: label, description, urgency, safeToText, church; or withdraw: yes.",
    true,
    ["ask my church to call me"]
  ),
  spec(
    "seed.faith.churches",
    "The churches the signed-in reader belongs to, from their own links at their Home (person.affiliations.list, type church) — who a prayer or a care request can be shared with. No args.",
    false,
    ["my churches"]
  ),
  spec(
    "seed.faith.shared",
    "What of the signed-in reader's faith life an audience may see (friends | church | leaders), decided by their agent from each record's own visibility (person.faith.shared.view). Args: audience, church, friend, purpose.",
    false,
    ["what can my church see"]
  ),
];

const MESSAGE: Record<FaithToolId, string> = {
  "seed.faith.journey": "where am I on my faith journey",
  "seed.faith.journey.record": "record a step of my faith journey",
  "seed.faith.prayers": "my prayers",
  "seed.faith.prayer.save": "keep my prayer",
  "seed.faith.care.request": "keep my care request",
  "seed.faith.shared": "what of my faith life may this audience see",
  "seed.faith.churches": "which churches do I belong to",
};

/** Only the arguments the person runtime declares, as strings; everything else the browser sent is dropped. */
export function forwardedArgs(
  id: FaithToolId,
  args: Record<string, unknown>
): Record<string, string> {
  const route: { args: readonly string[]; fixed?: Record<string, string> } =
    FORWARD[id];
  const out: Record<string, string> = { ...(route.fixed ?? {}) };
  for (const a of route.args) {
    const v = args[a];
    if (v === undefined || v === null) continue;
    out[a] = Array.isArray(v) ? v.map(String).join(",") : String(v);
  }
  return out;
}

export function faithInvokers(
  env: VaultEnv,
  readerOf: () => string
): Record<string, ToolInvoker> {
  const forward =
    (id: FaithToolId): ToolInvoker =>
    async (_t, args) => {
      const agent = await agentFor(env, readerOf());
      const out = await agent.run<
        Record<string, unknown> & { refused?: string }
      >(
        [{ toolId: FORWARD[id].to, args: forwardedArgs(id, args) }],
        MESSAGE[id]
      );
      if (out.result.refused) throw new WireRefusal(403, out.result.refused);
      return { ...out.result, runRef: out.runRef };
    };
  return Object.fromEntries(
    (Object.keys(FORWARD) as FaithToolId[]).map((id) => [id, forward(id)])
  );
}
