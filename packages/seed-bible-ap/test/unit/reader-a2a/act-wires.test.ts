// FRIENDS WITHOUT THE HOME'S WINDOW (act-as-me): the workspace keeps only standing wires that are the signed-in
// reader's, name ITS act key and cover adding or removing a contact; a lapsed wire is no permission; and when a step
// parks for the reader's authority, the same run is resumed with the chain derived from their wire — or, when no
// wire covers it, the answer says a signature is needed so the reader can open the Home instead.
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { PersonAgent } from "../../../apps/reader-a2a/src/clients/person-agent";
import { WireRefusal } from "../../../apps/reader-a2a/src/wires";
import {
  actWiresFor,
  actWiresProblem,
  keepActWires,
} from "../../../apps/reader-a2a/src/wires/act";
import {
  fakeWireDb,
  syntheticAskAsMeWire,
  TEST_READER_KEY,
} from "../../helpers/wires";

const READER = privateKeyToAccount(TEST_READER_KEY).address.toLowerCase();
const ACT_KEY = generatePrivateKey();
const ACT = privateKeyToAccount(ACT_KEY).address.toLowerCase();
const now = Math.floor(Date.now() / 1000);

const standing = (
  o: {
    capability?: string;
    delegate?: string;
    delegator?: string;
    validUntil?: number;
  } = {}
) => ({
  v: 1,
  template: "act-as-me",
  capability: o.capability ?? "person.contact.invite",
  wire: {
    delegator: o.delegator ?? READER,
    delegate: o.delegate ?? ACT,
    caveats: [],
    signature: "0x01",
  },
  ref: "0xabc",
  requirement: {
    type: "x",
    actions: ["invite"],
    validUntil: o.validUntil ?? now + 3600,
  },
});

describe("the standing wires this workspace keeps", () => {
  it("takes the reader's own wires for adding and removing a contact, naming its act key", () => {
    expect(
      actWiresProblem(
        [standing(), standing({ capability: "person.contact.remove" })],
        READER,
        ACT
      )
    ).toBeNull();
  });

  it("refuses another act, another key, someone else's wire, nothing at all, or no act key here", () => {
    expect(
      actWiresProblem(
        [standing({ capability: "treasury.payment.execute" })],
        READER,
        ACT
      )
    ).toMatch(/does not take/);
    expect(
      actWiresProblem(
        [standing({ delegate: "0x" + "1".repeat(40) })],
        READER,
        ACT
      )
    ).toMatch(/act key/);
    expect(
      actWiresProblem(
        [standing({ delegator: "0x" + "2".repeat(40) })],
        READER,
        ACT
      )
    ).toMatch(/not the signed-in reader/);
    expect(actWiresProblem([], READER, ACT)).toMatch(/no act wires/);
    expect(actWiresProblem([standing()], READER, null)).toMatch(/no act key/);
  });

  it("keeps them per reader, and a lapsed wire is no permission", async () => {
    const env = { READER_ACT_PRIVATE_KEY: ACT_KEY, DB: fakeWireDb() };
    await keepActWires(env, READER, [
      standing(),
      standing({ capability: "person.contact.remove", validUntil: now - 10 }),
    ]);
    expect((await actWiresFor(env, READER)).map((w) => w.capability)).toEqual([
      "person.contact.invite",
    ]);
    expect(await actWiresFor(env, "0x" + "3".repeat(40))).toEqual([]);
    await expect(
      keepActWires(env, READER, [standing({ delegate: "0x" + "1".repeat(40) })])
    ).rejects.toBeInstanceOf(WireRefusal);
  });
});

describe("acting under a standing wire", () => {
  async function agentReplying(replies: Array<Record<string, unknown>>) {
    const bodies: Array<Record<string, unknown>> = [];
    const askKey = generatePrivateKey();
    const wire = await syntheticAskAsMeWire({
      reader: READER,
      askKey: privateKeyToAccount(askKey).address,
    });
    const agent = new PersonAgent(
      { READER_ASK_PRIVATE_KEY: askKey, A2A_URL: "https://a2a.test" } as never,
      READER,
      wire as never,
      (async (_u: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({
          ok: true,
          runRef: "run-1",
          reply: replies.shift(),
        });
      }) as typeof fetch
    );
    return { agent, bodies };
  }
  const steps = [
    {
      toolId: "person.contact.invite",
      args: { contact: "0x" + "4".repeat(40), role: "friend" },
    },
  ];
  const via = { client: "seed-bible-reader", template: "act-as-me" };

  it("a parked step resumes the same run with the derived chain, and its result comes back", async () => {
    const { agent, bodies } = await agentReplying([
      { kind: "authority_required", capability: "person.contact.invite" },
      {
        kind: "answer",
        results: [{ toolId: "person.contact.invite", result: { added: true } }],
      },
    ]);
    const out = await agent.runActing(
      steps,
      "add",
      async () => ({ ok: true, presented: [{ child: 1 }, { parent: 2 }] }),
      via
    );
    expect(out.result).toEqual({ added: true });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({
      runRef: "run-1",
      presented: [{ child: 1 }, { parent: 2 }],
      via,
      addressee: READER,
    });
  });

  it("no covering wire: it says a signature is needed and does not resume", async () => {
    const { agent, bodies } = await agentReplying([
      { kind: "authority_required", capability: "person.contact.invite" },
    ]);
    await expect(
      agent.runActing(
        steps,
        "add",
        async () => ({
          ok: false,
          reason: "no standing wire covers person.contact.invite",
        }),
        via
      )
    ).rejects.toThrow(/^needs-signature/);
    expect(bodies).toHaveLength(1);
  });

  it("a step that needed no authority is simply done", async () => {
    const { agent, bodies } = await agentReplying([
      {
        kind: "answer",
        results: [
          { toolId: "person.contact.invite", result: { already: true } },
        ],
      },
    ]);
    const out = await agent.runActing(
      steps,
      "add",
      async () => ({ ok: false, reason: "unused" }),
      via
    );
    expect(out.result).toEqual({ already: true });
    expect(bodies).toHaveLength(1);
  });
});
