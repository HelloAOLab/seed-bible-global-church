// THE READER ASKS FOR ROWS, NOT PROSE. Every plan the workspace puts to a reader's agent is rendered from its step
// results, so it asks the runtime for rows only — no composer call, retrieval or tool-source preparation, which made a
// highlight's save take tens of seconds — and marks a plan of reads alone as background bookkeeping.
import { describe, expect, it } from "vitest";
import { PersonAgent } from "../../../apps/reader-a2a/src/clients/person-agent";
import { syntheticAskAsMeWire, TEST_READER_KEY } from "../../helpers/wires";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const READER = privateKeyToAccount(TEST_READER_KEY).address.toLowerCase();

async function sent(
  steps: Array<{ toolId: string; args?: Record<string, unknown> }>
) {
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
        reply: {
          kind: "answer",
          results: [{ toolId: steps[0]!.toolId, result: { ok: true } }],
        },
      });
    }) as typeof fetch
  );
  await agent.run(steps as never, "test");
  return bodies[0]!;
}

describe("what the workspace asks of a reader's agent", () => {
  it("asks for rows only, and marks a plan of reads as background", async () => {
    const body = await sent([
      { toolId: "library.file.read", args: { name: "x" } },
    ]);
    expect(body["rowsOnly"]).toBe(true);
    expect(body["background"]).toBe(true);
  });

  it("asks for rows only for a save too, but does not hide it from the person's activity", async () => {
    const body = await sent([
      { toolId: "library.file.save", args: { name: "x" } },
    ]);
    expect(body["rowsOnly"]).toBe(true);
    expect(body["background"]).toBeUndefined();
  });
});
