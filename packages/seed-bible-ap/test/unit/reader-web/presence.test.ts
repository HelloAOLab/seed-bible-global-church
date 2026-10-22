// Presence at the UI seam: the device beats the chapter on screen while signed in, visible and sharing; turning
// sharing off ends it; a friend's presence shows for mutual friends only and names where they are.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createPresence } from "../../../apps/reader-web/src/state/social/presence";

const SEED = { agent: "0x" + "22".repeat(20), name: "Seed Reader", wire: true };
const RUTH = "0x" + "11".repeat(20);

describe("presence", () => {
  it("beats the chapter on screen, only while signed in, visible and sharing; gone ends it", async () => {
    const backend = createDevBackend(SEED);
    let visible = true;
    const p = createPresence({
      backend,
      stores: memoryStores(),
      here: () => ({ scope: "JHN.3", label: "reading John 3 · BSB" }),
      isVisible: () => visible,
    });
    expect(await p.beat()).toBe(true);
    expect(backend.presence.get(SEED.agent)![0]).toMatchObject({
      app: "seed-bible-reader",
      scope: "JHN.3",
      label: "reading John 3 · BSB",
    });
    visible = false;
    expect(await p.beat()).toBe(false);
    visible = true;
    await p.setShare(false);
    expect(backend.presence.get(SEED.agent)).toEqual([]);
    expect(await p.beat()).toBe(false);
    await p.setShare(true);
    expect(backend.presence.get(SEED.agent)).toHaveLength(1);
    backend.setIdentity(null);
    expect(await p.beat()).toBe(false);
  });

  it("shows where mutual friends are, and nothing for anyone else", async () => {
    const backend = createDevBackend(SEED);
    backend.friendsView = {
      friends: [{ agent: RUTH, name: "Ruth" }],
      requests: [],
      requested: [{ agent: "0x" + "44".repeat(20), name: "Dan" }],
    };
    const now = Date.now();
    backend.presence.set(RUTH, [
      {
        app: "seed-bible-reader",
        scope: "ROM.8",
        label: "reading Romans 8 · BSB",
        at: now,
        until: now + 60_000,
      },
    ]);
    backend.presence.set("0x" + "44".repeat(20), [
      {
        app: "seed-bible-reader",
        label: "reading Psalm 1",
        at: now,
        until: now + 60_000,
      },
    ]);
    const p = createPresence({
      backend,
      stores: memoryStores(),
      here: () => null,
    });
    await p.refresh();
    expect(
      p.friends.value.map((f) => `${f.name}:${f.presence.length}`)
    ).toEqual(["Ruth:1"]);
    expect(p.here.value[0]!.presence[0]!.scope).toBe("ROM.8");
    // The remembered sharing preference comes back on the next open.
    const stores = memoryStores();
    await createPresence({ backend, stores, here: () => null }).setShare(false);
    const again = createPresence({ backend, stores, here: () => null });
    await new Promise((r) => setTimeout(r, 0));
    expect(again.share.value).toBe(false);
  });
});
