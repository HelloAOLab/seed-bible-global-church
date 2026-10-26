// A SIGN-IN BY EMAIL TAKES LONGER THAN TWO MINUTES (go to the inbox, find the code, type it). The SDK's popup gives up
// at two minutes — it cannot see the Home's window under the Home's opener policy — and the code the Home then relays
// reached no one: the reader stayed on "Sign in" (2026-10-26). The reader now goes on listening on the relay for this
// sign-in's code; Cancel stops it. Mocked at the boundary only: the SDK's popup opener; the relay is a real
// BroadcastChannel.
import { afterEach, describe, expect, it, vi } from "vitest";

const popup = vi.fn();
vi.mock("@agenticprimitives/connect-client", async (orig) => ({
  ...(await orig<object>()),
  openCentralAuthPopup: (...a: unknown[]) => popup(...a),
}));

const { RELAY_CHANNEL, signInPopup } =
  await import("../../../apps/reader-web/src/session");

const client = {
  startEnrollment: async () => ({
    url: "https://home.test/authorize?x",
    state: "st-1",
    authOrigin: "https://home.test",
    codeVerifier: "cv",
    nonce: "n-1",
  }),
  isAllowedIssuerOrigin: (o: string) => o === "https://home.test",
} as never;

afterEach(() => popup.mockReset());

describe("a sign-in that takes longer than the SDK waits", () => {
  it("still lands when the Home relays the code after the two-minute backstop", async () => {
    popup.mockResolvedValue({ status: "cancelled" }); // the SDK's abandon backstop
    const said: string[] = [];
    const pending = signInPopup(client, (m) => said.push(m));
    await new Promise((r) => setTimeout(r, 20));
    const home = new BroadcastChannel(RELAY_CHANNEL);
    home.postMessage({ kind: "ac-relay", state: "other", code: "not-ours" }); // another sign-in's: ignored
    home.postMessage({
      kind: "ac-relay",
      state: "st-1",
      code: "c-42",
      iss: "https://home.test",
    });
    const out = await pending;
    home.close();
    expect(out).toMatchObject({
      status: "success",
      code: "c-42",
      authOrigin: "https://home.test",
      codeVerifier: "cv",
      stash: { nonce: "n-1" },
    });
    expect(said.some((m) => /Still waiting for your Home/.test(m))).toBe(true);
  });

  it("Cancel stops the wait", async () => {
    popup.mockResolvedValue({ status: "cancelled" });
    const stop = new AbortController();
    const pending = signInPopup(client, undefined, stop.signal);
    await new Promise((r) => setTimeout(r, 20));
    stop.abort();
    // the SDK resolves cancelled on abort; the late wait ends too
    expect(await pending).toEqual({ status: "cancelled" });
  });
});
