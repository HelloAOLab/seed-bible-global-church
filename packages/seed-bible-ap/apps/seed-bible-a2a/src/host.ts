// THE SERVICE RUNS THE HARNESS too (spec 433): every registry read a client makes over A2A is a run on this
// service's own object. Two informational tools, no acts: the registry grants nothing.
import {
  createServiceHost,
  defaultSay,
  type ServiceHost,
} from "@agenticprimitives/service-host";
import {
  HarnessRunDO,
  durableObjectRunStore,
} from "@agenticprimitives/service-host/cloudflare";
import type { Planner, ToolSpec } from "@agenticprimitives/orchestration";
import type { Address } from "@agenticprimitives/types";
import type { OfferingRow } from "./registry/store";

export const REGISTRY_QUERY: ToolSpec = {
  id: "seed.svc.registry.query",
  description:
    "What Seed Bible agents released for a passage — offerings, studies, published notes, playlists, plans — from the Seed registry (an index of public shelves, verified release by release). Args: passage (OSIS; a verse narrows to its chapter), kind (optional).",
  inputSchema: {
    type: "object",
    properties: { passage: { type: "string" }, kind: { type: "string" } },
    required: ["passage"],
  },
  answers: [
    "what is there for this chapter",
    "offerings for John 3",
    "studies on this passage",
  ],
  establishes: "lookup",
};
export const REGISTRY_REINDEX: ToolSpec = {
  id: "seed.svc.registry.reindex",
  description:
    "Re-crawl every registered public shelf and rebuild the index. Reads what owners already made public; grants nothing.",
  inputSchema: { type: "object", properties: {} },
  answers: ["reindex the shelves", "refresh the registry"],
  establishes: "lookup",
};

export function svcAgentCard(origin: string): Record<string, unknown> {
  return {
    name: "Seed Bible service",
    version: "0.0.1",
    description:
      "The Seed Bible serving plane on the faithnet estate: the Seed registry over public shelves (verified releases, indexed by passage), public files and caches. Rebuildable; never the record.",
    provider: { organization: "Seed Bible", url: origin },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [],
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: [
      {
        id: REGISTRY_QUERY.id,
        name: "Query the Seed registry",
        description: REGISTRY_QUERY.description,
        tags: ["registry", "discover"],
        examples: ["offerings for JHN.3"],
      },
      {
        id: REGISTRY_REINDEX.id,
        name: "Reindex the shelves",
        description: REGISTRY_REINDEX.description,
        tags: ["registry"],
        examples: ["reindex"],
      },
    ],
  };
}

export interface SvcHostDeps {
  agentSa: Address;
  origin: string;
  internalHeaders: () => Record<string, string>;
  runs: DurableObjectNamespace;
  query: (passage: string, kind?: string) => Promise<OfferingRow[]>;
  reindex: () => Promise<unknown>;
  waitUntil?: (p: Promise<unknown>) => void;
  log?: (line: string) => void;
}

function planner(): Planner {
  return {
    async plan(input) {
      const goal = input.intent.goal;
      const m = /\b([1-4]?[A-Z]{2,3}\.\d+(?:\.\d+)?)\b/.exec(goal);
      if (/reindex|refresh/i.test(goal))
        return { steps: [{ id: "s1", toolId: REGISTRY_REINDEX.id, args: {} }] };
      return {
        steps: [
          {
            id: "s1",
            toolId: REGISTRY_QUERY.id,
            args: { passage: m?.[1] ?? goal },
          },
        ],
      };
    },
  };
}

export function createSvcHost(deps: SvcHostDeps): ServiceHost {
  const runStore = durableObjectRunStore(deps.runs, deps.internalHeaders);
  return createServiceHost({
    agent: deps.agentSa,
    origin: deps.origin,
    card: svcAgentCard(deps.origin),
    playbook: () => null,
    tools: [REGISTRY_QUERY, REGISTRY_REINDEX],
    invokers: () => ({
      [REGISTRY_QUERY.id]: async (_t, args) => {
        const rows = await deps.query(
          String(args.passage ?? ""),
          typeof args.kind === "string" ? args.kind : undefined
        );
        return {
          passage: String(args.passage ?? ""),
          count: rows.length,
          offerings: rows.map((r) => ({
            owner: r.owner,
            shelf: r.shelf,
            title: r.title,
            kind: r.kind,
            passage: r.passage_ref,
            descriptorId: r.descriptor_id,
            releaseId: r.release_id,
          })),
          text: rows.length
            ? `${rows.length} offering(s) for ${String(args.passage)}: ${rows.map((r) => `${r.title} (${r.kind}, ${r.shelf})`).join("; ")}`
            : `Nothing released for ${String(args.passage)} yet.`,
        };
      },
      [REGISTRY_REINDEX.id]: async () => ({
        report: await deps.reindex(),
        text: "reindexed",
      }),
    }),
    planner: planner(),
    runStore,
    admission: { public: true },
    turn: { say: (result) => defaultSay(result), maxSteps: 1, maxReplans: 0 },
    ...(deps.waitUntil ? { waitUntil: deps.waitUntil } : {}),
    ...(deps.log ? { log: deps.log } : {}),
  });
}

export class SvcRunDO extends HarnessRunDO<{ A2A_INTERNAL_MARKER?: string }> {
  protected isInternalCall(request: Request): boolean {
    const marker = (this.env.A2A_INTERNAL_MARKER ?? "").trim();
    return !!marker && request.headers.get("x-ap-internal") === marker;
  }
}
