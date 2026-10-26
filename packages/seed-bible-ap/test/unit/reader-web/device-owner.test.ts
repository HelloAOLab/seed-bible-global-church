// WHOSE COPY THE DEVICE HOLDS: a second person signing in on a device starts from none of the first person's own
// copies (profile, playlists, friends…), the device's settings stay; the same person signing in again keeps theirs;
// signing out forgets the copies. And a profile on the device is only ever shown to the person it belongs to.
import { describe, expect, it } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import {
  claimDevice,
  forgetPerson,
} from "../../../apps/reader-web/src/state/records/deviceOwner";
import { createProfile } from "../../../apps/reader-web/src/state/social/profile";
import type { ReaderBackend } from "../../../apps/reader-web/src/backend/ReaderBackend";

const RICHARD = "0x" + "aa".repeat(20);
const RUTH = "0x" + "bb".repeat(20);

async function deviceUsedBy(person: string) {
  const stores = memoryStores();
  await claimDevice(stores.prefs, person);
  await stores.prefs.set("works:seed-bible/profile", [{ "@id": "x" }]);
  await stores.prefs.set("friends", { friends: [] });
  await stores.prefs.set("sbr.settings", { theme: "dark" });
  await stores.prefs.set("tabs:open", { tabs: [] });
  return stores;
}

describe("whose copy the device holds", () => {
  it("a different person signing in starts from none of the first person's copies; settings stay", async () => {
    const stores = await deviceUsedBy(RICHARD);
    expect(await claimDevice(stores.prefs, RUTH)).toBe(true);
    expect((await stores.prefs.keys()).sort()).toEqual([
      "device:person",
      "sbr.settings",
      "tabs:open",
    ]);
    expect(await stores.prefs.get("device:person")).toBe(RUTH);
  });

  it("the same person signing in again keeps their copies", async () => {
    const stores = await deviceUsedBy(RICHARD);
    expect(
      await claimDevice(stores.prefs, RICHARD.toUpperCase().replace("0X", "0x"))
    ).toBe(false);
    expect(await stores.prefs.get("friends")).toEqual({ friends: [] });
  });

  it("signing out forgets the copies and whose they were", async () => {
    const stores = await deviceUsedBy(RICHARD);
    await forgetPerson(stores.prefs);
    expect((await stores.prefs.keys()).sort()).toEqual([
      "sbr.settings",
      "tabs:open",
    ]);
    expect(await claimDevice(stores.prefs, RUTH)).toBe(false);
  });
});

describe("the profile shown", () => {
  it("is the signed-in person's, never another profile left on the device", async () => {
    const stores = memoryStores();
    await stores.prefs.set("works:seed-bible/profile", [
      {
        "@id": `urn:seed:profile:${RICHARD}`,
        "@type": "seed:Profile",
        heldBy: RICHARD,
        label: "Richard P2",
        displayName: "Richard P2",
        createdAt: "2026-10-22T00:00:00Z",
        updatedAt: "2026-10-22T00:00:00Z",
      },
    ]);
    const as = async (agent: string) => {
      const who = { agent };
      const backend = { identity: () => who } as unknown as ReaderBackend;
      const p = createProfile(backend, stores, () => who as never);
      await p.ready;
      return p.mine.value?.displayName ?? null;
    };
    expect(await as(RUTH)).toBeNull();
    expect(await as(RICHARD)).toBe("Richard P2");
  });
});
