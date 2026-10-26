// AN INVITATION SAYS WHO IT IS FROM — never an address. A reader whose Home knows them by no name (a nameless agent:
// the sign-in's name is the agent's address) is asked how their friend should know them before the invitation goes;
// the name goes with it and, as offered, into their profile. A reader with a name is not asked (2026-10-26: an
// invitation arrived as "0xe2bfa5… invited you"). Mocked at the boundary only: reader-a2a's replies.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/preact";
import { FriendsPane } from "../../apps/reader-web/src/components/social/FriendsPane";
import { isPersonName } from "../../apps/reader-web/src/components/social/addFriend";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";

const AGENT = "0xe2bfa5" + "ab".repeat(17);
const jwt = () =>
  `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.y`;

function backend() {
  const invites: Array<Record<string, unknown>> = [];
  const real = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/friends/invites")) {
        if (init?.method === "POST")
          invites.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true, invites: [] });
      }
      if (url.includes("/api/public-name"))
        return Response.json({ name: null });
      if (url.includes("/api/findable"))
        return Response.json({ ok: true, email: false });
      return real(input, init);
    }
  );
  return invites;
}

async function pane(name: string) {
  const t = await createTestReaderState({
    session: {
      token: jwt(),
      estate: "faithnet",
      name,
      sub: `eip155:34348:${AGENT}`,
      via: "home",
      wire: true,
    },
  });
  return { t, r: renderInHost(<FriendsPane state={t.state} />) };
}

const invite = (r: ReturnType<typeof renderInHost>, email: string) => {
  fireEvent.input(r.getByPlaceholderText("Their email, or their name here"), {
    target: { value: email },
  });
  fireEvent.submit(r.container.querySelector(".sb-friends-add-form")!);
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("who an invitation is from", () => {
  it("knows an address is not a name", () => {
    expect(isPersonName("0xe2bfa5…")).toBe(false);
    expect(isPersonName("0xe2bfa5abababab")).toBe(false);
    expect(isPersonName("")).toBe(false);
    expect(isPersonName("Ruth Miller")).toBe(true);
    expect(isPersonName("Zoë")).toBe(true);
  });

  it("asks a nameless reader how to be known, sends it with the invitation, and keeps it in their profile", async () => {
    const invites = backend();
    const { t, r } = await pane("0xe2bfa5…");
    invite(r, "mom@example.com");
    await waitFor(() =>
      expect(
        r.queryByText("How should mom@example.com know you?")
      ).not.toBeNull()
    );
    expect(invites).toEqual([]); // nothing sent yet
    const send = r.getByRole("button", {
      name: "Send invitation",
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.input(r.getByPlaceholderText("Your first and last name"), {
      target: { value: "Ruth Miller" },
    });
    fireEvent.click(send);
    await waitFor(() =>
      expect(invites).toEqual([
        { email: "mom@example.com", fromName: "Ruth Miller" },
      ])
    );
    await waitFor(() =>
      expect(t.state.profile.mine.value?.displayName).toBe("Ruth Miller")
    );
    await waitFor(() =>
      expect(r.queryByText("How should mom@example.com know you?")).toBeNull()
    );
  });

  it("does not ask a reader who has a name", async () => {
    const invites = backend();
    const { r } = await pane("Richard Pedersen");
    invite(r, "mom@example.com");
    await waitFor(() =>
      expect(invites).toEqual([
        { email: "mom@example.com", fromName: "Richard Pedersen" },
      ])
    );
    expect(r.queryByText(/know you\?/)).toBeNull();
  });
});
