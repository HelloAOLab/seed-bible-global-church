import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  keepWire,
  wireFor,
  dropWire,
  wireProblem,
  WireRefusal,
} from "../../../apps/reader-a2a/src/wires";
import {
  fakeWireDb,
  syntheticAskAsMeWire,
  TEST_ASK_KEY,
  TEST_READER_KEY,
} from "../../helpers/wires";

const READER = "0xdbb41f779194d605e636f9bab64b105fd025b3db";
const ASK = privateKeyToAccount(TEST_ASK_KEY).address.toLowerCase();

describe("ask-as-me wire admission", () => {
  it("accepts the reader's own wire to this workspace's asking key", async () => {
    const wire = await syntheticAskAsMeWire({ reader: READER, askKey: ASK });
    expect(wireProblem(wire, READER, ASK)).toBeNull();
  });

  it("refuses a wire for another reader, to another key, expired, or for another skill", async () => {
    const other = privateKeyToAccount(TEST_READER_KEY).address;
    expect(
      wireProblem(
        await syntheticAskAsMeWire({ reader: other, askKey: ASK }),
        READER,
        ASK
      )
    ).toMatch(/not the signed-in reader/);
    expect(
      wireProblem(
        await syntheticAskAsMeWire({ reader: READER, askKey: other }),
        READER,
        ASK
      )
    ).toMatch(/does not name this workspace/);
    expect(
      wireProblem(
        await syntheticAskAsMeWire({
          reader: READER,
          askKey: ASK,
          validUntil: 1000,
        }),
        READER,
        ASK
      )
    ).toMatch(/not an ask-as-me wire/);
    expect(
      wireProblem(
        await syntheticAskAsMeWire({
          reader: READER,
          askKey: ASK,
          skill: "harness.read",
        }),
        READER,
        ASK
      )
    ).toMatch(/not an ask-as-me wire/);
    expect(
      wireProblem(
        await syntheticAskAsMeWire({ reader: READER, askKey: ASK }),
        READER,
        null
      )
    ).toMatch(/no asking key/);
  });

  it("keeps, replaces and drops one wire per reader", async () => {
    const env = { DB: fakeWireDb(), READER_ASK_PRIVATE_KEY: TEST_ASK_KEY };
    const first = await syntheticAskAsMeWire({ reader: READER, askKey: ASK });
    await keepWire(env, READER, first);
    expect((await wireFor(env, READER))?.signature).toBe(first.signature);
    const second = await syntheticAskAsMeWire({
      reader: READER,
      askKey: ASK,
      validUntil: Math.floor(Date.now() / 1000) + 3600,
    });
    await keepWire(env, READER, second);
    expect((await wireFor(env, READER))?.signature).toBe(second.signature);
    await dropWire(env, READER);
    expect(await wireFor(env, READER)).toBeNull();
  });

  it("refuses to keep a wire that is not the reader's, and says why", async () => {
    const env = { DB: fakeWireDb(), READER_ASK_PRIVATE_KEY: TEST_ASK_KEY };
    const other = privateKeyToAccount(TEST_READER_KEY).address;
    await expect(
      keepWire(
        env,
        READER,
        await syntheticAskAsMeWire({ reader: other, askKey: ASK })
      )
    ).rejects.toBeInstanceOf(WireRefusal);
    expect(await wireFor(env, READER)).toBeNull();
  });
});
