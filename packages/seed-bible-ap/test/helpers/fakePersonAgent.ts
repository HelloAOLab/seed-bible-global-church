// THE FAKE PERSON AGENT — a2a.faithnet.io in a test: `/harness/ask` admits the workspace the way the estate's
// runtime does (an `A2A-Session` assertion over the exact body, signed by the asking key under the reader's
// ask-as-me wire; the wire checked with the same `wireProblem` reader-a2a keeps wires by, and its signature
// recovered to the reader), then runs the plan's `library.*` steps against a fakeLibrary as the addressee and the
// few `person.*` reads the reader asks for from what a test put in. `/harness/progress` answers the finished line.
// Mount with installFakeNetwork({ "a2a.faithnet.io": agent.app }).
import { Hono } from "hono";
import { parseSessionWrappedSignature } from "@agenticprimitives/a2a";
import {
  callerAssertionDigest,
  parseSessionAuthorization,
  requestBodyHash,
} from "@agenticprimitives/a2a/standard";
import { hashDelegation } from "@agenticprimitives/delegation";
import { recoverAddress, recoverMessageAddress, type Hex } from "viem";
import { wireProblem } from "../../apps/reader-a2a/src/wires";
import { TOWN } from "../../estate/faithnet";
import { LIBRARY_TOOL_IDS, type FakeLibrary } from "./fakeLibrary";

export interface PlanStep {
  id?: string;
  toolId: string;
  args: Record<string, unknown>;
}

export interface AskRecord {
  runRef: string;
  /** The reader the assertion acts as. */
  agent: string;
  addressee: string;
  message: string;
  steps: PlanStep[];
  reply: Record<string, unknown>;
}

export interface FakePersonAgentOptions {
  library: FakeLibrary;
  /** `person.contact.list` rows per agent. */
  contacts?: Record<string, unknown[]>;
  /** `person.friend.list` per agent. */
  friends?: Record<
    string,
    { friends?: unknown[]; requests?: unknown[]; requested?: unknown[] }
  >;
  /** `person.affiliations.list` `links` rows per agent. */
  affiliations?: Record<string, unknown[]>;
  /** `mcp.connectors.list` rows per agent. */
  connectors?: Record<string, unknown[]>;
  /** The runtime's clock, for an expiry test. */
  now?: () => number;
  /** Tools this agent's playbook does not offer (an older snapshot): refused in the runtime's words. */
  refuse?: string[];
}

export interface FakePersonAgent {
  app: Hono;
  /** Every admitted ask, in order. */
  asks: AskRecord[];
  /** Every refusal at the door, in order (status and words). */
  refusals: Array<{ status: number; error: string }>;
}

const LIBRARY = new Set<string>(LIBRARY_TOOL_IDS);

export function fakePersonAgent(opts: FakePersonAgentOptions): FakePersonAgent {
  const app = new Hono();
  const asks: AskRecord[] = [];
  const refusals: Array<{ status: number; error: string }> = [];
  let runs = 0;
  const now = opts.now ?? (() => Date.now());
  const refuse = (status: number, error: string) => {
    refusals.push({ status, error });
    return Response.json({ ok: false, error }, { status });
  };

  app.post("/harness/ask", async (c) => {
    const raw = await c.req.text();
    const assertion = parseSessionAuthorization(c.req.header("authorization"));
    if (!assertion) return refuse(401, "no A2A-Session assertion");
    if (assertion.bodyHash !== requestBodyHash(raw))
      return refuse(401, "the assertion does not cover this body");
    if (assertion.audience !== new URL(c.req.url).origin)
      return refuse(401, "the assertion is for another origin");
    if (Math.abs(Math.floor(now() / 1000) - assertion.issuedAt) > 300)
      return refuse(401, "the assertion is stale");
    const wrapped = parseSessionWrappedSignature(assertion.signature);
    if (!wrapped) return refuse(401, "the signature carries no wire");
    const wire = wrapped.wire as unknown as Parameters<typeof wireProblem>[0];
    const askKey = String(wire.delegate).toLowerCase();
    const problem = wireProblem(
      wire,
      assertion.agent,
      askKey,
      Math.floor(now() / 1000)
    );
    if (problem) return refuse(401, problem);
    // The wire's own signature: the reader signed it (an EOA here — the runtime asks the chain, ERC-1271).
    const delegationHash = hashDelegation(
      {
        delegator: wire.delegator as Hex,
        delegate: wire.delegate as Hex,
        authority: wire.authority as Hex,
        caveats: wire.caveats as never,
        salt: BigInt(wire.salt),
        signature: wire.signature as Hex,
      },
      TOWN.chainId,
      TOWN.contracts.delegationManager as Hex
    );
    const signer = await recoverMessageAddress({
      message: { raw: delegationHash },
      signature: wire.signature as Hex,
    }).catch(() => null);
    if (
      !signer ||
      signer.toLowerCase() !== String(wire.delegator).toLowerCase()
    )
      return refuse(401, "the wire was not signed by its delegator");
    const asserter = await recoverAddress({
      hash: callerAssertionDigest({
        agent: assertion.agent,
        method: assertion.method,
        bodyHash: assertion.bodyHash,
        issuedAt: assertion.issuedAt,
        audience: assertion.audience,
      }),
      signature: wrapped.sig,
    }).catch(() => null);
    if (!asserter || asserter.toLowerCase() !== askKey)
      return refuse(401, "the assertion was not signed by the wire's delegate");

    const body = JSON.parse(raw) as {
      addressee?: string;
      message?: string;
      plan?: { steps?: PlanStep[] };
    };
    const agent = assertion.agent.toLowerCase();
    const addressee = String(body.addressee ?? agent).toLowerCase();
    const steps = body.plan?.steps ?? [];
    const runRef = `run-${++runs}`;
    const results: Array<{ toolId: string; result: unknown }> = [];
    let reply: Record<string, unknown>;
    try {
      for (const step of steps) {
        const result = await invoke(step, agent, addressee);
        results.push({ toolId: step.toolId, result });
      }
      reply = { kind: "answer", runRef, results, result: results[0]?.result };
    } catch (e) {
      reply = {
        kind: "error",
        runRef,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    asks.push({
      runRef,
      agent,
      addressee,
      message: String(body.message ?? ""),
      steps,
      reply,
    });
    return c.json({ ok: true, runRef, reply });
  });

  app.get("/harness/progress", (c) => {
    const runRef = c.req.query("runRef") ?? asks[asks.length - 1]?.runRef;
    const ask = asks.find((a) => a.runRef === runRef);
    if (!ask) return c.json({ ok: false, error: "no such run" }, 404);
    return c.json({
      ok: true,
      runRef: ask.runRef,
      state: "finished",
      line: `finished: ${ask.steps.map((s) => s.toolId).join(", ")}`,
    });
  });

  async function invoke(
    step: PlanStep,
    agent: string,
    addressee: string
  ): Promise<unknown> {
    const args = step.args ?? {};
    if (opts.refuse?.includes(step.toolId))
      throw new Error(
        `plan_refused: step 1 names "${step.toolId}", which this agent does not offer — choose among: library.file.save, library.file.visibility, library.file.publish, ask.unsupported.`
      );
    if (LIBRARY.has(step.toolId)) {
      // A Library is written by its own agent; another agent's is read only when public.
      const acts = step.toolId.startsWith("library.file.");
      if (acts && addressee !== agent)
        return {
          refused: `a Library is written by its own agent or by a steward of it — ${agent} does not steward ${addressee}`,
          owner: addressee,
        };
      return opts.library.run(addressee, step.toolId, args);
    }
    switch (step.toolId) {
      case "person.contact.list": {
        const contacts = opts.contacts?.[agent] ?? [];
        return { contacts, count: contacts.length };
      }
      case "person.friend.list": {
        const v = opts.friends?.[agent] ?? {};
        return {
          friends: v.friends ?? [],
          requests: v.requests ?? [],
          requested: v.requested ?? [],
        };
      }
      case "person.affiliations.list":
        return { links: opts.affiliations?.[agent] ?? [] };
      case "mcp.connectors.list": {
        const connectors = opts.connectors?.[agent] ?? [];
        return { connectors, count: connectors.length };
      }
      case "person.presence.list":
        return { count: 0, here: [], away: [] };
      default:
        return {
          refused: `${agent}'s agent does not offer ${step.toolId} (unknown_tool)`,
        };
    }
  }

  return { app, asks, refusals };
}
