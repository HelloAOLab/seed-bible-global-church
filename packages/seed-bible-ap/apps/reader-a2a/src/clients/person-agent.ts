// THE READER'S AGENT, ASKED AS THEM — one supplied plan per call to `${A2A_URL}/harness/ask` with `addressee` the
// reader, signed by this workspace's asking key under the reader's ask-as-me wire (an `A2A-Session` assertion). The
// reader's own agent admits the wire, runs the step under their standing, and writes their Library as them. This
// workspace never writes a reader's vault itself (agents-and-skills.md; pattern: demo-openbook-reader server/agent.ts).
import { wrapSessionSignature } from "@agenticprimitives/a2a";
import {
  callerAssertionDigest,
  requestBodyHash,
  sessionAuthorizationHeader,
  STANDARD_SURFACE_SKILL,
  type CallerAssertionV1,
} from "@agenticprimitives/a2a/standard";
import { sign as signRaw } from "viem/accounts";
import type { Hex } from "viem";
import { WireRefusal, type DelegationWire } from "../wires";

export interface PersonAgentEnv {
  READER_ASK_PRIVATE_KEY?: string;
  /** The estate's agent runtime — every person's agent answers here (estate/faithnet.ts `a2a`). */
  A2A_URL?: string;
}

export interface PlanStep {
  toolId: string;
  args: Record<string, unknown>;
}

type Reply = {
  kind?: string;
  text?: string;
  error?: string;
  result?: unknown;
  results?: Array<{ toolId: string; result: unknown }>;
  prompt?: { prompt?: string };
  runRef?: string;
};

export interface PersonAgentOutcome<T> {
  runRef: string | null;
  result: T;
}

export class PersonAgent {
  private readonly key: Hex;
  private readonly origin: string;

  constructor(
    env: PersonAgentEnv,
    private readonly reader: string,
    private readonly wire: DelegationWire,
    fetchImpl: typeof fetch = fetch
  ) {
    if (!env.READER_ASK_PRIVATE_KEY)
      throw new WireRefusal(503, "this workspace holds no asking key");
    if (!env.A2A_URL) throw new WireRefusal(503, "A2A_URL is not configured");
    this.key = env.READER_ASK_PRIVATE_KEY as Hex;
    this.origin = env.A2A_URL.replace(/\/+$/, "");
    this.fetch = (input, init) => fetchImpl(input, init);
  }
  private readonly fetch: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;

  /** ONE supplied plan at the reader's agent, as them. The first step's result, or a refusal in their agent's words. */
  async run<T>(
    steps: PlanStep[],
    message: string,
    opts: { addressee?: string } = {}
  ): Promise<PersonAgentOutcome<T>> {
    const nonce = [...crypto.getRandomValues(new Uint8Array(8))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const raw = JSON.stringify({
      method: STANDARD_SURFACE_SKILL,
      nonce,
      // An organization the reader stewards may be the addressee: the ask is still as the reader (the assertion and
      // the wire are theirs); the runtime derives their standing at the organization.
      addressee: (opts.addressee ?? this.reader).toLowerCase(),
      message,
      plan: { steps },
      // The reader renders the step's rows, never the agent's sentence: no composer call, no retrieval to ground one,
      // no tool sources the plan does not name (the runtime's `rowsOnly`, honoured for a supplied plan only). A plan
      // of reads alone is the app's own bookkeeping, kept out of the person's "what my agent did" list.
      rowsOnly: true,
      ...(steps.every((st) => /\.(read|list)$/.test(st.toolId))
        ? { background: true }
        : {}),
    });
    const base: Omit<CallerAssertionV1, "signature"> = {
      agent: this.reader,
      method: STANDARD_SURFACE_SKILL,
      bodyHash: requestBodyHash(raw),
      issuedAt: Math.floor(Date.now() / 1000),
      audience: new URL(this.origin).origin,
    };
    const sig = await signRaw({
      hash: callerAssertionDigest(base),
      privateKey: this.key,
      to: "hex",
    });
    const assertion: CallerAssertionV1 = {
      ...base,
      signature: wrapSessionSignature(this.wire as never, sig),
    };
    const res = await this.fetch(`${this.origin}/harness/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: sessionAuthorizationHeader(assertion),
      },
      body: raw,
    }).catch((e: unknown) => {
      throw new WireRefusal(
        502,
        `your agent could not be reached: ${e instanceof Error ? e.message : String(e)}`
      );
    });
    const out = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!out)
      throw new WireRefusal(
        res.status,
        `your agent answered ${res.status} with no JSON`
      );
    if (!res.ok || out["ok"] === false)
      throw new WireRefusal(
        res.status,
        String(out["error"] ?? `your agent answered ${res.status}`)
      );
    const reply = (out["reply"] ?? {}) as Reply;
    // Where the agent's time went, per stage (names and ms only) — the runtime puts it on every reply's trace.
    const stages = (
      reply as { plannerTrace?: { stages?: Record<string, number> } }
    ).plannerTrace?.stages;
    if (stages)
      console.log(
        `[agent-timing] ${steps.map((s) => s.toolId).join("+")} ${JSON.stringify(stages)}`
      );
    const runRef =
      typeof out["runRef"] === "string"
        ? out["runRef"]
        : (reply.runRef ?? null);
    if (reply.kind === "refused" || reply.kind === "error")
      throw new WireRefusal(
        409,
        reply.error ?? reply.text ?? "your agent refused"
      );
    if (reply.kind === "authority_required" || reply.kind === "prompt")
      throw new WireRefusal(
        409,
        `your agent parked the step: ${reply.prompt?.prompt ?? reply.text ?? "it needs something this app cannot supply"}`
      );
    const first = steps[0]?.toolId;
    const step = (reply.results?.find((r) => r.toolId === first)?.result ??
      reply.result) as (T & { refused?: string }) | undefined;
    if (step === undefined)
      throw new WireRefusal(
        502,
        `your agent's reply carried no result for ${first}`
      );
    if (step && typeof step === "object" && "refused" in step && step.refused)
      throw new WireRefusal(409, String(step.refused));
    return { runRef, result: step };
  }
}
