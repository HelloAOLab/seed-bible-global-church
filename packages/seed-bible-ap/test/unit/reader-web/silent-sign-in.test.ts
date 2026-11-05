// SIGNING BACK IN WITHOUT BEING ASKED AGAIN. Every sign-in used to send `prompt=select_account`, which makes the
// Home drop its own session: the person signed in from scratch and consented again each time. Now the ordinary
// Sign in sends no prompt, "Use a different account" asks for the chooser, and a visit with nobody signed in asks
// the Home once, with no screen, for the person who signed in last (`prompt=none` + `login_hint`).
//
// The rules are plain functions (`sign-in-modes.ts`), tested as they are; the URLs are also read off the real
// connect client through `session.ts`, with only the browser stubbed (location, the two storages, the popup opener).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HINT_KEY,
  SILENT_TRIED_KEY,
  afterSilentRefusal,
  authorizeUrlFor,
  clearHint,
  hintSubOf,
  homeReturnOf,
  isHomeReturn,
  markSilentTried,
  readHint,
  restoredAddress,
  safeReturnTo,
  shouldTrySilent,
  silentTried,
  withoutHomeReturn,
  writeHint,
  type SilentInputs,
} from "../../../apps/reader-web/src/sign-in-modes";

const DELEGATE = "0x89D13c596c45E4eE80Af5ae06C727FE9A820ffD0";
const ALICE = "eip155:34348:0x1111111111111111111111111111111111111111";
const BOB = "eip155:34348:0x2222222222222222222222222222222222222222";
const HOME = "https://www.faithnet.me";
const READER = "https://seed-reader.faithnet.io";
const BASE = `${HOME}/?client_id=seed-bible-reader&state=s1&delegation_template=site-login`;

function memoryStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    has: (k: string) => m.has(k),
  };
}
const params = (url: string) => new URL(url).searchParams;

describe("the authorize URL for each way of signing in", () => {
  it("sends no prompt on the ordinary Sign in, and asks for the ask-as-me wire", () => {
    const p = params(authorizeUrlFor(BASE, { kind: "default" }));
    expect(p.has("prompt")).toBe(false);
    expect(p.has("login_hint")).toBe(false);
    expect(p.get("delegation_template")).toBe("ask-as-me");
  });

  it("asks for the Home's account chooser on Use a different account", () => {
    const p = params(authorizeUrlFor(BASE, { kind: "choose" }));
    expect(p.get("prompt")).toBe("select_account");
    expect(p.has("login_hint")).toBe(false);
    expect(p.get("delegation_template")).toBe("ask-as-me");
  });

  it("asks for no screen and names the last person on a silent attempt", () => {
    const p = params(
      authorizeUrlFor(BASE, { kind: "silent", loginHint: ALICE })
    );
    expect(p.get("prompt")).toBe("none");
    expect(p.get("login_hint")).toBe(ALICE);
    expect(p.get("delegation_template")).toBe("ask-as-me");
  });

  it("carries the one friend step the Home takes afterwards, and leaves the rest of the URL alone", () => {
    const p = params(
      authorizeUrlFor(BASE, { kind: "default" }, `${HOME}/contacts`)
    );
    expect(p.get("then")).toBe(`${HOME}/contacts`);
    expect(p.get("client_id")).toBe("seed-bible-reader");
    expect(p.get("state")).toBe("s1");
  });
});

describe("the remembered last sign-in", () => {
  it("is kept and read back", () => {
    const device = memoryStore();
    writeHint(device, { estate: "faithnet", sub: ALICE });
    expect(readHint(device)).toEqual({ estate: "faithnet", sub: ALICE });
  });

  it("is nothing when the stored value is not a person's id", () => {
    expect(readHint(memoryStore())).toBeNull();
    expect(readHint(memoryStore({ [HINT_KEY]: "not json" }))).toBeNull();
    expect(
      readHint(
        memoryStore({
          [HINT_KEY]: JSON.stringify({ estate: "faithnet", sub: "0xabc" }),
        })
      )
    ).toBeNull();
  });

  it("is cleared by clearHint", () => {
    const device = memoryStore();
    writeHint(device, { estate: "faithnet", sub: ALICE });
    clearHint(device);
    expect(readHint(device)).toBeNull();
  });

  it("takes the person's id from the token's sub, else its canonical_agent_id", () => {
    expect(hintSubOf({ sub: ALICE })).toBe(ALICE);
    expect(hintSubOf({ sub: "0xabc", canonical_agent_id: BOB })).toBe(BOB);
    expect(hintSubOf({ sub: "someone" })).toBeNull();
  });
});

describe("what the Home's refusal of a silent attempt does", () => {
  it("drops the hint on login_required: the Home will not sign that person in without a screen", () => {
    const device = memoryStore();
    writeHint(device, { estate: "faithnet", sub: ALICE });
    afterSilentRefusal(device, "login_required");
    expect(readHint(device)).toBeNull();
  });

  it.each(["consent_required", "interaction_required", "server_error"])(
    "keeps the hint on %s",
    (error) => {
      const device = memoryStore();
      writeHint(device, { estate: "faithnet", sub: ALICE });
      afterSilentRefusal(device, error);
      expect(readHint(device)).toEqual({ estate: "faithnet", sub: ALICE });
    }
  );
});

describe("whether a page load tries a silent sign-in", () => {
  const due: SilentInputs = {
    search: "",
    signedIn: false,
    hint: { estate: "faithnet", sub: ALICE },
    tried: false,
    homeSignInAvailable: true,
    online: true,
    framed: false,
  };

  it("tries when nobody is signed in and someone is remembered", () => {
    expect(shouldTrySilent(due)).toBe(true);
    expect(shouldTrySilent({ ...due, search: "?v=16" })).toBe(true);
  });

  it("does not try twice in one tab", () => {
    expect(shouldTrySilent({ ...due, tried: true })).toBe(false);
  });

  it.each([
    "?code=c&state=s",
    "?error=login_required&state=s",
    "?state=s",
    "?error=consent_required",
    "?code=c",
  ])("never tries on a load that is the Home's answer (%s)", (search) => {
    expect(shouldTrySilent({ ...due, search })).toBe(false);
  });

  it("does not try with a sign-in kept, nobody remembered, no Home client, offline or inside a frame", () => {
    expect(shouldTrySilent({ ...due, signedIn: true })).toBe(false);
    expect(shouldTrySilent({ ...due, hint: null })).toBe(false);
    expect(shouldTrySilent({ ...due, homeSignInAvailable: false })).toBe(false);
    expect(shouldTrySilent({ ...due, online: false })).toBe(false);
    expect(shouldTrySilent({ ...due, framed: true })).toBe(false);
  });

  it("marks the attempt in the tab's storage, and counts a storage that cannot keep the mark as already tried", () => {
    const tab = memoryStore();
    expect(silentTried(tab)).toBe(false);
    expect(markSilentTried(tab)).toBe(true);
    expect(silentTried(tab)).toBe(true);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => undefined,
    };
    expect(silentTried(blocked)).toBe(true);
    expect(markSilentTried(blocked)).toBe(false);
  });
});

describe("reading the Home's answer off the page address", () => {
  it("tells a code, a refusal and an ordinary load apart", () => {
    expect(homeReturnOf("?code=c1&state=s1")).toEqual({
      kind: "code",
      code: "c1",
      state: "s1",
    });
    expect(homeReturnOf("?error=login_required&state=s1")).toEqual({
      kind: "error",
      error: "login_required",
      state: "s1",
    });
    expect(homeReturnOf("?v=16")).toEqual({ kind: "none" });
    expect(homeReturnOf("?code=c1")).toEqual({ kind: "none" });
    expect(isHomeReturn("?v=16")).toBe(false);
  });

  it("cleans what the Home added and keeps the page's own parameters", () => {
    expect(
      withoutHomeReturn(
        "/read/BSB/JHN/3",
        "?v=16&error=login_required&state=s1",
        "#x"
      )
    ).toBe("/read/BSB/JHN/3?v=16#x");
    expect(withoutHomeReturn("/", "?code=c&state=s")).toBe("/");
  });

  it("puts a silent attempt back on the page it began on, still carrying the answer", () => {
    expect(restoredAddress("/read/BSB/JHN/3?v=16", "?code=c1&state=s1")).toBe(
      "/read/BSB/JHN/3?v=16&code=c1&state=s1"
    );
    expect(
      restoredAddress("/read/BSB/JHN/3", "?error=login_required&state=s1")
    ).toBe("/read/BSB/JHN/3?state=s1&error=login_required");
  });

  it("returns only to a path on this site", () => {
    expect(safeReturnTo("/read/BSB/JHN/3")).toBe("/read/BSB/JHN/3");
    expect(safeReturnTo("//evil.example/x")).toBe("/");
    expect(safeReturnTo("https://evil.example/x")).toBe("/");
    expect(safeReturnTo(undefined)).toBe("/");
  });
});

// ── Through session.ts, on the real connect client ──────────────────────────────────────────────────────────────────

const popup = vi.fn();
vi.mock("@agenticprimitives/connect-client", async (orig) => ({
  ...(await orig<object>()),
  openCentralAuthPopup: (...a: unknown[]) => popup(...a),
}));
vi.stubEnv("VITE_CONNECT_DELEGATE", DELEGATE);
const session = await import("../../../apps/reader-web/src/session");

const WIRE = { delegator: "0xabc", delegate: "0xdef", signature: "0x1" };

/** A browser: an address, the two storages, and the network the sign-in's end talks to. */
function browser(
  opts: {
    path?: string;
    search?: string;
    device?: Record<string, string>;
    tab?: Record<string, string>;
    token?: Record<string, unknown>;
    workspaceHoldsWire?: boolean;
  } = {}
) {
  const device = memoryStore(opts.device);
  const tab = memoryStore(opts.tab);
  const went: string[] = [];
  const handed: unknown[] = [];
  const loc = {
    origin: READER,
    pathname: opts.path ?? "/",
    search: opts.search ?? "",
    hash: "",
    replace: (url: string) => void went.push(url),
    set href(url: string) {
      went.push(url);
    },
  };
  vi.stubGlobal("localStorage", device);
  vi.stubGlobal("sessionStorage", tab);
  vi.stubGlobal("location", loc);
  vi.stubGlobal("window", { top: null });
  vi.stubGlobal("history", {
    replaceState: (_s: unknown, _t: string, url: string) => {
      const u = new URL(url, READER);
      loc.pathname = u.pathname;
      loc.search = u.search;
      loc.hash = u.hash;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/token"))
        return Response.json(opts.token ?? { id_token: "t", delegation: WIRE });
      if (url.endsWith("/api/connect")) {
        handed.push(JSON.parse(String(init?.body)).delegation);
        return Response.json({ ok: true });
      }
      if (url.endsWith("/me"))
        return Response.json({ ok: true, wire: !!opts.workspaceHoldsWire });
      return new Response("no", { status: 404 });
    })
  );
  (window as unknown as { top: unknown }).top = window;
  return { device, tab, went, handed, loc };
}

const hintOf = (who: string) => ({
  [HINT_KEY]: JSON.stringify({ estate: "faithnet", sub: who }),
});
const homeClient = (claims: Record<string, unknown>) =>
  ({ verifyIdToken: async () => claims }) as never;
const finishAs = (claims: Record<string, unknown>) =>
  session.finish(homeClient(claims), "faithnet", HOME, "code", "cv", "nonce");

beforeEach(() => {
  popup.mockResolvedValue({ status: "blocked" });
});
afterEach(() => {
  popup.mockReset();
  vi.unstubAllGlobals();
});

describe("the URLs the reader sends people to", () => {
  it("Sign in: the Home's authorize URL with no prompt", async () => {
    const b = browser();
    await session.connectViaHome("faithnet");
    const p = params(b.went[0]!);
    expect(new URL(b.went[0]!).origin).toBe(HOME);
    expect(p.has("prompt")).toBe(false);
    expect(p.get("delegation_template")).toBe("ask-as-me");
    expect(p.get("client_id")).toBe("seed-bible-reader");
    expect(p.get("redirect_uri")).toBe(`${READER}/`);
    // The popup the person is offered first is opened on the same URL.
    expect(params(String(popup.mock.calls[0]![0])).has("prompt")).toBe(false);
  });

  it("Use a different account: the same URL with prompt=select_account, and the remembered person forgotten", async () => {
    const b = browser({ device: hintOf(ALICE) });
    await session.connectViaHome("faithnet", undefined, {
      differentAccount: true,
    });
    expect(params(b.went[0]!).get("prompt")).toBe("select_account");
    expect(params(String(popup.mock.calls[0]![0])).get("prompt")).toBe(
      "select_account"
    );
    expect(readHint(b.device)).toBeNull();
  });

  it("a visit with nobody signed in and someone remembered: prompt=none and login_hint, as a full-page visit", async () => {
    const b = browser({
      path: "/read/BSB/JHN/3",
      search: "?v=16",
      device: hintOf(ALICE),
    });
    expect(await session.silentSignInIfDue()).toBe(true);
    expect(b.went).toHaveLength(1);
    const p = params(b.went[0]!);
    expect(p.get("prompt")).toBe("none");
    expect(p.get("login_hint")).toBe(ALICE);
    expect(p.get("delegation_template")).toBe("ask-as-me");
    expect(p.has("mode")).toBe(false);
    expect(popup).not.toHaveBeenCalled();
    expect(b.tab.getItem(SILENT_TRIED_KEY)).toBe("1");
  });
});

describe("a silent attempt, start to finish", () => {
  it("is made once per tab", async () => {
    const b = browser({ device: hintOf(ALICE) });
    expect(await session.silentSignInIfDue()).toBe(true);
    expect(await session.silentSignInIfDue()).toBe(false);
    expect(b.went).toHaveLength(1);
  });

  it("is not made when nobody is remembered, or when a sign-in is kept (a dev reader's among them)", async () => {
    const none = browser();
    expect(await session.silentSignInIfDue()).toBe(false);
    expect(none.went).toEqual([]);
    const dev = browser({
      device: {
        ...hintOf(ALICE),
        "sbr.session": JSON.stringify({
          token: "dev:seed",
          estate: "faithnet",
          name: "Seed (dev reader)",
          sub: "0xabc",
          via: "dev-stub",
          wire: false,
        }),
      },
    });
    expect(await session.silentSignInIfDue()).toBe(false);
    expect(dev.went).toEqual([]);
  });

  it("is not made on a load that is itself the Home's answer", async () => {
    const b = browser({
      search: "?error=consent_required&state=other",
      device: hintOf(ALICE),
    });
    expect(await session.silentSignInIfDue()).toBe(false);
    expect(b.went).toEqual([]);
  });

  it.each([
    ["login_required", null],
    ["consent_required", { estate: "faithnet", sub: ALICE }],
    ["interaction_required", { estate: "faithnet", sub: ALICE }],
  ] as const)(
    "refused with %s: signed out, nothing said, the address cleaned, no second attempt",
    async (error, hintAfter) => {
      const b = browser({
        path: "/read/BSB/JHN/3",
        search: "?v=16",
        device: hintOf(ALICE),
      });
      await session.silentSignInIfDue();
      const state = params(b.went[0]!).get("state");
      // The Home answers at the registered address, "/".
      b.loc.pathname = "/";
      b.loc.search = `?error=${error}&state=${state}`;
      session.restoreSilentReturnAddress();
      expect(b.loc.pathname).toBe("/read/BSB/JHN/3");
      await expect(session.completeRedirectIfReturning()).resolves.toBeNull();
      expect(`${b.loc.pathname}${b.loc.search}`).toBe("/read/BSB/JHN/3?v=16");
      expect(session.loadSession()).toBeNull();
      expect(readHint(b.device)).toEqual(hintAfter);
      expect(await session.silentSignInIfDue()).toBe(false);
      expect(b.went).toHaveLength(1);
    }
  );

  it("granted: the answer is put back on the page the person was on, for the sign-in to finish there", async () => {
    const b = browser({ path: "/read/BSB/JHN/3", device: hintOf(ALICE) });
    await session.silentSignInIfDue();
    const pending = JSON.parse(b.tab.getItem("sbr.connect.pending")!) as {
      state: string;
      silent: boolean;
      returnTo: string;
    };
    expect(pending).toMatchObject({
      silent: true,
      returnTo: "/read/BSB/JHN/3",
    });
    b.loc.pathname = "/";
    b.loc.search = `?code=c1&state=${pending.state}`;
    session.restoreSilentReturnAddress();
    expect(homeReturnOf(b.loc.search).kind).toBe("code");
    expect(b.loc.pathname).toBe("/read/BSB/JHN/3");
  });
});

describe("the hint through signing in and out", () => {
  it("is set by a Home sign-in and kept across the reader's Sign out", async () => {
    const b = browser();
    const s = await finishAs({ sub: ALICE, name: "Alice" });
    expect(s.sub).toBe(ALICE);
    expect(readHint(b.device)).toEqual({ estate: "faithnet", sub: ALICE });
    session.signOut();
    session.noSilentSignInThisTab();
    expect(session.loadSession()).toBeNull();
    expect(readHint(b.device)).toEqual({ estate: "faithnet", sub: ALICE });
    // Signing out is the person's own act: this tab does not sign them straight back in.
    expect(await session.silentSignInIfDue()).toBe(false);
    expect(b.went).toEqual([]);
  });

  it("follows the person the Home actually signed in, when that is not the one asked for", async () => {
    const b = browser({ device: hintOf(ALICE) });
    const s = await finishAs({ sub: BOB, name: "Bob" });
    expect(s.sub).toBe(BOB);
    expect(s.via).toBe("home");
    expect(readHint(b.device)).toEqual({ estate: "faithnet", sub: BOB });
  });

  it("is dropped when a dev reader signs in", () => {
    const b = browser({ device: hintOf(ALICE) });
    if (!session.DEV_READER_AVAILABLE) return;
    session.signInAsDevReader("seed", "Seed", "0xabc");
    expect(readHint(b.device)).toBeNull();
  });
});

describe("the wire when the Home's /token returns none", () => {
  it("signs the person in without it and says why", async () => {
    const b = browser({ token: { id_token: "t" } });
    const s = await finishAs({ sub: ALICE });
    expect(b.handed).toEqual([]);
    expect(s.wire).toBe(false);
    expect(s.wireNote).toMatch(/reading still works/);
    expect(readHint(b.device)).toEqual({ estate: "faithnet", sub: ALICE });
  });

  it("uses the wire the workspace still holds from an earlier sign-in", async () => {
    const b = browser({ token: { id_token: "t" }, workspaceHoldsWire: true });
    const s = await finishAs({ sub: ALICE });
    expect(b.handed).toEqual([]);
    expect(s.wire).toBe(true);
    expect(s.wireNote).toMatch(/earlier sign-in/);
  });

  it("hands on the wire a remembered sign-in returns, the same as a first one", async () => {
    const b = browser();
    const s = await finishAs({ sub: ALICE });
    expect(b.handed).toEqual([WIRE]);
    expect(s.wire).toBe(true);
  });
});
