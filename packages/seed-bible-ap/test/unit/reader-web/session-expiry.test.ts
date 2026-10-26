// WHEN THE SESSION LAPSES (test-plan A3.3): an expired id_token leaves the reader's marks on the device and asks
// them to sign in again; a wire the agent no longer admits asks for the permission again; nothing is lost either
// way, and the flush resumes once the Home has issued a new token or a new wire.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createA2aBackend } from "../../../apps/reader-web/src/backend/a2a";
import { createTestReaderState } from "../../helpers/createTestReaderState";
import { fakeHomeJwks } from "../../helpers/fakeHomeJwks";
import { fakeLibrary } from "../../helpers/fakeLibrary";
import { fakePersonAgent } from "../../helpers/fakePersonAgent";
import { fakeWorkspace } from "../../helpers/fakeWorkspace";
import { installFakeNetwork } from "../../helpers/fakeNetwork";
import { syntheticAskAsMeWire, TEST_READER_KEY } from "../../helpers/wires";

const READER = privateKeyToAccount(TEST_READER_KEY).address.toLowerCase();
const T0 = new Date("2026-10-22T10:00:00Z");
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function signedIn(opts: { tokenHours: number; wireHours: number }) {
  const home = fakeHomeJwks();
  const library = fakeLibrary();
  const agent = fakePersonAgent({ library });
  const workspace = fakeWorkspace({ library });
  installFakeNetwork({
    "a2a.faithnet.io": agent.app,
    "www.faithnet.me": home.app,
  });
  await workspace.connect(
    READER,
    await syntheticAskAsMeWire({
      reader: READER,
      askKey: workspace.askKey,
      validUntil: sec(hours(opts.wireHours)),
    })
  );
  const token = await home.issueIdToken({
    sub: READER,
    name: "Ruth",
    exp: sec(hours(opts.tokenHours)),
  });
  const session = (await workspace.sessionFor(token))!;
  const held = { value: session };
  const backend = createA2aBackend(() => held.value, workspace.fetch);
  const t = await createTestReaderState({ backend, session });
  return { ...t, home, library, agent, workspace, held };
}

describe("session expiry", () => {
  it("an expired id_token: the marks stay on the device, the reader is asked to sign in again, and a new token resumes the flush", async () => {
    const { state, stores, home, library, held } = await signedIn({
      tokenHours: 1,
      wireHours: 24,
    });
    await state.highlights.set("JHN.3", 16, 16, "yellow");
    vi.setSystemTime(hours(2));
    const r = await state.outbox.flush();
    expect(r.merged).toEqual([]);
    expect(r.error).toMatch(/session/i);
    expect(state.outbox.pending.value).toBe(1);
    expect(await stores.outbox.get("highlights:JHN.3")).toMatchObject({
      collection: "highlights",
      chapter: "JHN.3",
    });
    expect(state.sessionTrouble.value).toBe("expired");
    expect(
      library.text(READER, "seed-bible/highlights/JHN", "3.jsonld")
    ).toBeNull();
    // The device still shows the mark. (The lapse signs the reader out on its own clock — the next test.)
    expect(state.highlights.forChapter("JHN.3").value).toHaveLength(1);

    // The Home issues a new token: sign in again, and what waited goes up.
    const token = await home.issueIdToken({
      sub: READER,
      name: "Ruth",
      exp: sec(hours(10)),
    });
    held.value = { ...held.value, token };
    // Signing in resyncs, and the resync flushes what waited; a flush after it has nothing left to send.
    await state.signIn(held.value);
    const again = await state.outbox.flush();
    expect(again.error).toBeUndefined();
    expect(state.outbox.pending.value).toBe(0);
    expect(state.sessionTrouble.value).toBeNull();
    expect(
      library.text(READER, "seed-bible/highlights/JHN", "3.jsonld")
    ).toContain("JHN.3.16");
  });

  it("a wire the agent no longer admits: the reader is asked for the permission again, nothing is lost, and a new wire resumes the flush", async () => {
    const { state, library, agent, workspace, held } = await signedIn({
      tokenHours: 24,
      wireHours: 1,
    });
    await state.highlights.set("JHN.3", 16, 16, "yellow");
    vi.setSystemTime(hours(2));
    const r = await state.outbox.flush();
    expect(r.merged).toEqual([]);
    expect(r.error).toMatch(/wire/i);
    expect(agent.refusals.length).toBeGreaterThan(0);
    expect(new Set(agent.refusals.map((x) => x.error))).toEqual(
      new Set([
        "the Home returned a delegation that is not an ask-as-me wire (session wire outside its timestamp window)",
      ])
    );
    expect(state.outbox.pending.value).toBe(1);
    expect(state.sessionTrouble.value).toBe("wire");
    expect(
      library.text(READER, "seed-bible/highlights/JHN", "3.jsonld")
    ).toBeNull();

    // The Home mints a new wire at the next sign-in and the workspace keeps it; the same session, the flush resumes.
    await workspace.connect(
      READER,
      await syntheticAskAsMeWire({
        reader: READER,
        askKey: workspace.askKey,
        validUntil: sec(hours(48)),
      })
    );
    await state.signIn({ ...held.value, wire: true });
    const again = await state.outbox.flush();
    expect(again.error).toBeUndefined();
    expect(state.outbox.pending.value).toBe(0);
    expect(state.sessionTrouble.value).toBeNull();
    expect(
      library.text(READER, "seed-bible/highlights/JHN", "3.jsonld")
    ).toContain("JHN.3.16");
  });
  it("the moment the sign-in lapses the reader is signed out too, and told", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(T0);
    const { state } = await signedIn({ tokenHours: 1, wireHours: 24 });
    expect(state.session.value?.sub).toBe(READER);
    await vi.advanceTimersByTimeAsync(3_600_000 - 1000);
    expect(state.session.value?.sub).toBe(READER);
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.session.value).toBeNull();
    expect(state.ui.toast.value).toMatchObject({ key: "signed-out-expired" });
  });
});
