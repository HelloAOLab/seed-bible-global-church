// THE READER AGENT RUNS THE HARNESS — the same `@agenticprimitives/service-host` shape as the Scripture Agent in
// verifiable-content-demo (`apps/demo-bible-a2a/src/host.ts`), cut down to one skill. Every ask that reaches it —
// a stranger's, a signed-in reader's — is ONE harness run on the agent's own Durable Object: planned (one skill),
// invoked (hello, through reader-mcp), recorded, with a run reference. The host makes the hello accountable;
// the skill itself is as small as a skill gets.

import {
  createServiceHost,
  defaultSay,
  type ServiceHost,
  type AdmittedPrincipal,
} from "@agenticprimitives/service-host";
import {
  HarnessRunDO,
  durableObjectRunStore,
} from "@agenticprimitives/service-host/cloudflare";
import type {
  ToolSpec,
  ToolInvoker,
  Planner,
} from "@agenticprimitives/orchestration";
import type { Address } from "@agenticprimitives/types";
import { TOOLS, HELLO_TOOL, invokers, type SkillDeps } from "./skills";
import type { VaultEnv } from "./skills/vault";
export { HELLO_TOOL };

export function readerAgentCard(origin: string): Record<string, unknown> {
  return {
    name: "Seed Bible Reader",
    version: "0.0.1",
    description:
      "The Seed Bible reader workspace agent on the faithnet estate — hello world today; passages, notes and the reader's own records next.",
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
        id: HELLO_TOOL.id,
        name: "Hello, reader",
        description: HELLO_TOOL.description,
        tags: ["hello-world", "reader"],
        examples: ["hello", "say hello to Ruth"],
      },
    ],
  };
}

export interface ReaderHostDeps {
  /** The workspace's wires and asking key: what the act tools use to ask the reader's agent as them. */
  env: VaultEnv;
  agentSa: Address;
  origin: string;
  internalHeaders: () => Record<string, string>;
  runs: DurableObjectNamespace;
  /** A Home session bearer → the reader, or null (session.ts). */
  bearer: (token: string) => Promise<{ agent: Address; name: string } | null>;
  /** The hello itself — reader-mcp's `hello` tool. */
  hello: (
    name: string | undefined
  ) => Promise<{ greeting: string; workspace: string }>;
  waitUntil?: (p: Promise<unknown>) => void;
  log?: (line: string) => void;
}

/** ONE SKILL, SO ONE PLAN: whatever was asked is the hello step. Deterministic, so a reviewer can reproduce it. */
export function singleSkillPlanner(): Planner {
  return {
    async plan(input) {
      return {
        steps: [
          { id: "s1", toolId: HELLO_TOOL.id, args: { ask: input.intent.goal } },
        ],
      };
    },
  };
}

export function createReaderHost(deps: ReaderHostDeps): ServiceHost {
  const runStore = durableObjectRunStore(deps.runs, deps.internalHeaders);
  // The bearer port answers only an address; the name rides beside it for the greeting.
  const names = new Map<string, string>();
  return createServiceHost({
    agent: deps.agentSa,
    origin: deps.origin,
    card: readerAgentCard(deps.origin),
    playbook: () => null,
    tools: TOOLS,
    invokers: ({ asker }) =>
      invokers(
        {
          env: deps.env,
          hello: deps.hello,
          askerName: names.get(asker.agent.toLowerCase()),
        } satisfies SkillDeps,
        asker
      ),
    planner: singleSkillPlanner(),
    runStore,
    admission: {
      public: true,
      bearer: async (token) => {
        const r = await deps.bearer(token);
        if (!r) return null;
        names.set(r.agent.toLowerCase(), r.name);
        return { agent: r.agent };
      },
    },
    turn: { say: (result) => defaultSay(result), maxSteps: 1, maxReplans: 0 },
    ...(deps.waitUntil ? { waitUntil: deps.waitUntil } : {}),
    ...(deps.log ? { log: deps.log } : {}),
  });
}

/** The agent's own run object: checkpoints, progress, records. Bound as `RUNS` in wrangler.toml. */
export class ReaderRunDO extends HarnessRunDO<{
  A2A_INTERNAL_MARKER?: string;
}> {
  protected isInternalCall(request: Request): boolean {
    const marker = (this.env.A2A_INTERNAL_MARKER ?? "").trim();
    return !!marker && request.headers.get("x-ap-internal") === marker;
  }
}
