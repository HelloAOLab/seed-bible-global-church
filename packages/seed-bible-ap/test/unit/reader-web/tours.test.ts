// GUIDED TOURS: a tour walks its steps and is remembered as seen; a contextual tour shows once; Skip can turn
// them all off and Account can turn them on again; a link names a linkable tour and its step; a phone gets its own
// introduction and no desktop-only tour.
import { describe, expect, it } from "vitest";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import {
  createTours,
  parseTutorialLink,
} from "../../../apps/reader-web/src/state/chrome/tours";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("tours", () => {
  it("walks a tour, remembers it, and shows a contextual one once", async () => {
    const stores = memoryStores();
    const prepared: string[] = [];
    const tours = createTours({
      prefs: stores.prefs,
      prepare: (id, s) => prepared.push(`${id}:${s.id}`),
    });
    await tick();
    expect(tours.start("introduction")).toBe(true);
    expect(tours.current.value?.id).toBe("tabs");
    tours.next();
    tours.back();
    expect(tours.current.value?.id).toBe("tabs");
    for (let i = 0; i < 5; i++) tours.next();
    expect(tours.active.value).toBeNull();
    expect(tours.seen.value).toEqual(["introduction"]);
    expect(prepared[0]).toBe("introduction:tabs");

    expect(tours.startContextual("selector")).toBe(true);
    tours.done();
    expect(tours.startContextual("selector")).toBe(false);
    await tick();
    const again = createTours({ prefs: stores.prefs });
    await tick();
    expect(again.startContextual("selector")).toBe(false);
  });

  it("Skip can turn contextual tours off; Account turns them on again; a button still starts one", async () => {
    const stores = memoryStores();
    const tours = createTours({ prefs: stores.prefs });
    await tick();
    tours.startContextual("selector");
    tours.skip(true);
    expect(tours.startContextual("offline-download")).toBe(false);
    expect(tours.start("introduction")).toBe(true);
    tours.done();
    tours.turnOn();
    expect(tours.startContextual("selector")).toBe(true);
  });

  it("reads links, gives a phone its own introduction, and refuses a desktop-only tour there", async () => {
    expect(
      parseTutorialLink(new URLSearchParams("tutorial=search&tutorialStep=0"))
    ).toEqual({ id: "search", step: 0 });
    expect(
      parseTutorialLink(new URLSearchParams("tutorial=selector"))
    ).toBeNull();
    expect(
      parseTutorialLink(
        new URLSearchParams("tutorial=introduction&tutorialStep=x")
      )
    ).toEqual({ id: "introduction", step: 0 });
    const phone = createTours({
      prefs: memoryStores().prefs,
      isPhone: () => true,
    });
    await tick();
    phone.start("introduction");
    expect(phone.current.value?.id).toBe("books");
    expect(phone.start("pane-layout")).toBe(false);
  });
});
