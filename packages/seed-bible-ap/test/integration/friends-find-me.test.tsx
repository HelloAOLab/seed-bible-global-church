// "FRIENDS CAN FIND YOU AS" SAYS ONLY WHAT A FRIEND CAN TYPE (2026-10-25: it showed the Google display name "alice
// Renner", which finds no one, so a friend typed "alice" and reached a different person, alice.me). Your public name
// when you have one; your email when you let people find you by it; with neither, it says they can't find you by
// searching and offers the email switch. Mocked at the boundary only: reader-a2a's replies.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/preact";
import { FriendsPane } from "../../apps/reader-web/src/components/social/FriendsPane";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";

const AGENT = "0x" + "ab".repeat(20);
const jwt = (claims: Record<string, unknown>) =>
  `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims }))}.y`;

function reader(opts: { name: string | null; findable: boolean }) {
  const posted: unknown[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/public-name"))
        return Response.json({ address: AGENT, name: opts.name });
      if (url.includes("/api/findable")) {
        if (init?.method === "POST") {
          posted.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true });
        }
        return Response.json({ ok: true, email: opts.findable });
      }
      if (url.includes("/api/friends/invites"))
        return Response.json({ ok: true, invites: [] });
      return real(input, init);
    }
  );
  return posted;
}

async function pane() {
  const t = await createTestReaderState({
    session: {
      token: jwt({ email: "alice.renner@example.com" }),
      estate: "faithnet",
      name: "alice Renner",
      sub: `eip155:34348:${AGENT}`,
      via: "home",
      wire: true,
    },
  });
  return renderInHost(<FriendsPane state={t.state} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Friends can find you as", () => {
  it("shows your public name when you have one, never your display name", async () => {
    reader({ name: "alice.me", findable: false });
    const r = await pane();
    await waitFor(() =>
      expect(
        r.container.querySelector(".sb-friends-my-id-value")?.textContent
      ).toBe("alice.me")
    );
    expect(
      r.container.querySelector(".sb-friends-my-id")?.textContent
    ).not.toContain("alice Renner");
  });

  it("with no public name and email off, says friends can't find you by searching and offers the email switch", async () => {
    const posted = reader({ name: null, findable: false });
    const r = await pane();
    await waitFor(() =>
      expect(r.queryByText(/can't find you by searching/)).not.toBeNull()
    );
    expect(
      r.container.querySelector(".sb-friends-my-id")?.textContent
    ).not.toContain("alice Renner");
    const box = r.getByLabelText(
      /let people who have my email \(alice\.renner@example\.com\) find me/i
    );
    fireEvent.click(box);
    await waitFor(() => expect(posted).toEqual([{ email: true }]));
    await waitFor(() =>
      expect(
        r.container.querySelector(".sb-friends-my-id-value")?.textContent
      ).toBe("alice.renner@example.com")
    );
  });
});
