// NOTHING SECRET IN THE LOGS (test-plan A3.10): every console line written while a signed-in reader's harness asks
// run in-process — the door, the real skill invokers, the person's agent under the wire, the browser's backend and
// bucket store, including the refusals an expired wire and a lapsed token produce — carries no id_token, no wire
// (its signature or salt), no asking key, and no person's agent address.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createA2aBackend } from "../../../apps/reader-web/src/backend/a2a";
import { createTestReaderState } from "../../helpers/createTestReaderState";
import { fakeHomeJwks } from "../../helpers/fakeHomeJwks";
import { fakeLibrary } from "../../helpers/fakeLibrary";
import { fakePersonAgent } from "../../helpers/fakePersonAgent";
import { fakeWorkspace } from "../../helpers/fakeWorkspace";
import { installFakeNetwork } from "../../helpers/fakeNetwork";
import {
  syntheticAskAsMeWire,
  TEST_ASK_KEY,
  TEST_READER_KEY,
} from "../../helpers/wires";

const READER = privateKeyToAccount(TEST_READER_KEY).address.toLowerCase();
const ASK_KEY = privateKeyToAccount(TEST_ASK_KEY).address.toLowerCase();
const T0 = new Date("2026-10-22T10:00:00Z");
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

const lines: string[] = [];
function captureConsole() {
  for (const m of ["log", "warn", "error", "info", "debug"] as const)
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) =>
      lines.push(
        args
          .map((a) =>
            a instanceof Error
              ? `${a.name}: ${a.message}`
              : typeof a === "string"
                ? a
                : JSON.stringify(a)
          )
          .join(" ")
      )
    );
}

beforeEach(() => {
  lines.length = 0;
  captureConsole();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("log hygiene", () => {
  it("a day's asks — a merge, a read, an expired wire, a lapsed token — log no token, wire or person address", async () => {
    const home = fakeHomeJwks();
    const library = fakeLibrary();
    const agent = fakePersonAgent({ library });
    const workspace = fakeWorkspace({ library });
    installFakeNetwork({
      "a2a.faithnet.io": agent.app,
      "www.faithnet.me": home.app,
    });
    const wire = await syntheticAskAsMeWire({
      reader: READER,
      askKey: workspace.askKey,
      validUntil: sec(hours(1)),
    });
    await workspace.connect(READER, wire);
    const token = await home.issueIdToken({
      sub: READER,
      name: "Ruth",
      exp: sec(hours(2)),
    });
    const session = (await workspace.sessionFor(token))!;
    const held = { value: session };
    const backend = createA2aBackend(() => held.value, workspace.fetch);
    const { state } = await createTestReaderState({ backend, session });

    await state.highlights.set("JHN.3", 16, 16, "yellow");
    expect((await state.outbox.flush()).error).toBeUndefined();
    await backend.readBucket("highlights", "JHN.3");
    // The wire lapses: the refusal is logged by the bucket store in the agent's words.
    vi.setSystemTime(hours(1.5));
    await state.highlights.set("JHN.3", 17, 17, "green");
    expect((await state.outbox.flush()).error).toMatch(/wire/);
    await state.buckets.resync();
    // The token lapses too.
    vi.setSystemTime(hours(3));
    await state.highlights.set("JHN.3", 18, 18, "pink");
    expect((await state.outbox.flush()).error).toMatch(/session/i);
    await state.buckets.resync();
    // A stranger at the door.
    await workspace.app.request("/harness/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session: "not-a-token",
        plan: {
          steps: [
            { toolId: "seed.bucket.read", args: { collection: "highlights" } },
          ],
        },
      }),
    });

    expect(lines.length).toBeGreaterThan(0);
    const out = lines.join("\n");
    const secrets: Array<[string, string]> = [
      ["the id_token", token],
      ["the token's signature", token.split(".")[2]!],
      ["the wire's signature", wire.signature],
      ["the wire's salt", `"salt":"${wire.salt}"`],
      ["the asking private key", TEST_ASK_KEY],
      ["the asking key's address", ASK_KEY],
      ["the reader's address", READER],
      [
        "the reader's address, checksummed",
        privateKeyToAccount(TEST_READER_KEY).address,
      ],
    ];
    for (const [what, value] of secrets)
      expect(
        out.toLowerCase().includes(value.toLowerCase()),
        `${what} appears in a log line`
      ).toBe(false);
    expect(out).not.toMatch(/0x[0-9a-f]{40}/i);
    expect(out).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
});
