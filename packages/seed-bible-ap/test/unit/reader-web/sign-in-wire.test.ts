// THE WIRE FROM A HOME SIGN-IN REACHES THE WORKSPACE. The reader asks the Home for the ask-as-me template; the Home
// then mints the wire as the sign-in's own `delegation`, not as an `askDelegation` beside a site grant. The reader
// read only `askDelegation`, so a person signing in with Google got "Your Home returned no permission…" and nothing
// synced (found 2026-10-22). Either field is handed on now; reader-a2a still checks it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { finish } from "../../../apps/reader-web/src/session";

const WIRE = {
  delegator: "0xabc",
  delegate: "0xdef",
  caveats: [],
  signature: "0x1",
};

function stubNetwork(token: Record<string, unknown>) {
  const handed: unknown[] = [];
  vi.stubGlobal("sessionStorage", {
    setItem: () => undefined,
    getItem: () => null,
    removeItem: () => undefined,
  });
  vi.stubGlobal("location", { origin: "https://seed-reader.faithnet.io" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/token")) return Response.json(token);
      if (url.endsWith("/api/connect")) {
        handed.push(JSON.parse(String(init?.body)).delegation);
        return Response.json({ ok: true });
      }
      if (url.endsWith("/me")) return Response.json({ ok: true, wire: false });
      return new Response("no", { status: 404 });
    })
  );
  return handed;
}
const client = {
  verifyIdToken: async () => ({ sub: "0xabc", name: "Richard" }),
} as never;

afterEach(() => vi.unstubAllGlobals());

describe("the wire after a Home sign-in", () => {
  it("hands on a wire the Home returned as the sign-in's delegation (the ask-as-me template)", async () => {
    const handed = stubNetwork({ id_token: "t", delegation: WIRE });
    const s = await finish(
      client,
      "faithnet",
      "https://www.faithnet.me",
      "code",
      "verifier",
      "nonce"
    );
    expect(handed).toEqual([WIRE]);
    expect(s.wire).toBe(true);
  });

  it("prefers an askDelegation beside a site grant", async () => {
    const handed = stubNetwork({
      id_token: "t",
      delegation: { site: true },
      askDelegation: WIRE,
    });
    await finish(
      client,
      "faithnet",
      "https://www.faithnet.me",
      "code",
      "verifier",
      "nonce"
    );
    expect(handed).toEqual([WIRE]);
  });

  it("says plainly when the Home returned no wire at all", async () => {
    const handed = stubNetwork({ id_token: "t" });
    const s = await finish(
      client,
      "faithnet",
      "https://www.faithnet.me",
      "code",
      "verifier",
      "nonce"
    );
    expect(handed).toEqual([]);
    expect(s.wire).toBe(false);
  });
});
