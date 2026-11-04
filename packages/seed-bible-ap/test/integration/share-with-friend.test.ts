// SHARING WITH A FRIEND — two readers through the dev backend (one shared world): Ruth shares a note with Eli; the first
// time she signs twice at her Home (the read grant, then the message with the link); Eli opens the link and reads the
// note with his own agent under the grant; a second share reaches him with no new signing and no new message; a third
// person with the same link reads nothing; and a note taken back is gone from Eli's view.
import { beforeEach, describe, expect, it } from "vitest";
import { createDevBackend } from "../../apps/reader-web/src/backend/dev";
import {
  devShareWorld,
  resetDevShares,
} from "../../apps/reader-web/src/backend/devShare";
import { memoryStores } from "../../apps/reader-web/src/backend/offline/db";
import {
  createShare,
  readShareLink,
} from "../../apps/reader-web/src/state/social/share";

const RUTH = { agent: "0x" + "1".repeat(40), name: "Ruth", wire: true };
const ELI = { agent: "0x" + "2".repeat(40), name: "Eli", wire: true };
const MALLORY = { agent: "0x" + "3".repeat(40), name: "Mallory", wire: true };
const note = (key: string, text: string) => ({
  key,
  kind: "note" as const,
  title: "John 3:16",
  passage: "JHN.3",
  text,
});

function reader(who: typeof RUTH) {
  const backend = createDevBackend(who);
  const opened: string[] = [];
  const share = createShare({
    backend,
    prefs: memoryStores().prefs,
    me: () => ({ agent: who.agent, name: who.name }),
    homeOrigin: "https://home.test",
    origin: "https://reader.test",
    openWindow: (u) => {
      opened.push(u);
      // the Home's window: the person signs what was parked
      setTimeout(() => backend.signParked(), 5);
      return null;
    },
    pollMs: 10,
    waitMs: 2000,
  });
  return { backend, share, opened };
}

beforeEach(() => resetDevShares());

describe("sharing with a friend", () => {
  it("first share: two signatures at the Home, then Eli reads it from the link", async () => {
    const ruth = reader(RUTH);
    ruth.backend.parkGrants = true;
    expect(
      await ruth.share.shareWith(
        { agent: ELI.agent, name: "Eli" },
        note("n1", "For God so loved")
      )
    ).toBe(true);
    expect(ruth.share.progress.value?.step).toBe("done");
    expect(ruth.opened).toEqual([
      "https://home.test/you?run=run-grant-222222",
      "https://home.test/you?run=run-msg-222222",
    ]);
    const msg = devShareWorld.messages.at(-1)!;
    expect(msg.to).toBe(ELI.agent);
    const link = readShareLink(
      new URL(
        /https:\/\/reader\.test\/shared-with-me\?\S+/.exec(msg.message)![0]
      )
    );
    expect(link?.from).toBe(RUTH.agent);

    const eli = reader(ELI);
    await eli.share.accept(link!);
    const got = eli.share.shelves.value[`${RUTH.agent}|${link!.shelf}`];
    expect(got && "items" in got ? got.items.map((i) => i.text) : got).toEqual([
      "For God so loved",
    ]);
  });

  it("a later share needs no signing and no message; a note taken back is gone", async () => {
    const ruth = reader(RUTH);
    await ruth.share.shareWith({ agent: ELI.agent }, note("n1", "first"));
    const link = readShareLink(
      new URL(
        /https:\/\/reader\.test\/shared-with-me\?\S+/.exec(
          devShareWorld.messages.at(-1)!.message
        )![0]
      )
    )!;
    const sent = devShareWorld.messages.length;
    ruth.opened.length = 0;
    await ruth.share.shareWith({ agent: ELI.agent }, note("n2", "second"));
    expect(devShareWorld.messages.length).toBe(sent);
    expect(ruth.opened).toEqual([]);

    const eli = reader(ELI);
    await eli.share.accept(link);
    const view = () => {
      const g = eli.share.shelves.value[`${RUTH.agent}|${link.shelf}`];
      return g && "items" in g ? g.items.map((i) => i.key) : g;
    };
    expect(view()).toEqual(["n2", "n1"]);
    await ruth.share.unshare(ELI.agent, "n1");
    await eli.share.refresh();
    expect(view()).toEqual(["n2"]);
  });

  it("someone else with the same link reads nothing", async () => {
    const ruth = reader(RUTH);
    await ruth.share.shareWith(
      { agent: ELI.agent },
      note("n1", "private to Eli")
    );
    const link = readShareLink(
      new URL(
        /https:\/\/reader\.test\/shared-with-me\?\S+/.exec(
          devShareWorld.messages.at(-1)!.message
        )![0]
      )
    )!;
    const mallory = reader(MALLORY);
    await mallory.share.accept(link);
    const got = mallory.share.shelves.value[`${RUTH.agent}|${link.shelf}`];
    expect(got && "error" in got).toBe(true);
  });

  it("a grant never signed ends the share in plain words", async () => {
    const ruth = reader(RUTH);
    ruth.backend.parkGrants = true;
    const share = createShare({
      backend: ruth.backend,
      prefs: memoryStores().prefs,
      me: () => ({ agent: RUTH.agent, name: "Ruth" }),
      homeOrigin: "https://home.test",
      origin: "https://reader.test",
      openWindow: () => null,
      pollMs: 5,
      waitMs: 40,
    });
    expect(await share.shareWith({ agent: ELI.agent }, note("n1", "x"))).toBe(
      false
    );
    expect(share.progress.value).toMatchObject({ step: "failed" });
    expect(share.progress.value?.error).toMatch(/not signed/);
    expect(devShareWorld.messages).toEqual([]);
  });
});
