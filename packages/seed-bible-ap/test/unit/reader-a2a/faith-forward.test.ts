// What the workspace forwards to the reader's agent for a faith act: only the arguments the person runtime declares,
// as words — never anything else the browser sent; the churches list always asks for churches only.
import { describe, expect, it } from "vitest";
import {
  forwardedArgs,
  FAITH_TOOLS,
} from "../../../apps/reader-a2a/src/skills/faith";

describe("faith forwarding", () => {
  it("drops what the person runtime does not take, and joins lists", () => {
    expect(
      forwardedArgs("seed.faith.prayer.save", {
        label: "Surgery",
        visibility: "LeadersOnly",
        sharedWith: ["0x" + "c".repeat(40), "0x" + "d".repeat(40)],
        heldBy: "0x" + "e".repeat(40),
        __proto__: { injected: true },
      })
    ).toEqual({
      label: "Surgery",
      visibility: "LeadersOnly",
      sharedWith: `0x${"c".repeat(40)},0x${"d".repeat(40)}`,
    });
  });
  it("the churches list asks for churches, whatever was sent", () => {
    expect(forwardedArgs("seed.faith.churches", { type: "treasury" })).toEqual({
      type: "church",
    });
  });
  it("every faith tool is offered, the acts without a lookup class", () => {
    const byId = Object.fromEntries(FAITH_TOOLS.map((t) => [t.id, t]));
    expect(Object.keys(byId).sort()).toEqual([
      "seed.faith.care.request",
      "seed.faith.churches",
      "seed.faith.journey",
      "seed.faith.journey.record",
      "seed.faith.prayer.save",
      "seed.faith.prayers",
      "seed.faith.shared",
    ]);
    expect(byId["seed.faith.prayer.save"]!.establishes).toBeUndefined();
    expect(byId["seed.faith.prayers"]!.establishes).toBe("lookup");
  });
});
