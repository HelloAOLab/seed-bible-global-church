// THE FAITH PAGE'S STATE: signed out it holds nothing and asks for nothing; signed in, each act goes to the reader's
// agent and the page then shows what the agent now holds — a prayer added, prayed for and answered, a stage said, a
// milestone removed; a failed call is said in words, never thrown at the page.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { createFaith } from "../../../apps/reader-web/src/state/faith/faith";

const ME = { agent: "0x" + "a1".repeat(20), name: "Ruth", wire: true };

describe("the reader's faith records", () => {
  it("signed out: nothing is read and nothing is shown", async () => {
    const backend = createDevBackend(null);
    const faith = createFaith(backend, () => !!backend.identity());
    await faith.refresh();
    expect(faith.loaded.value).toBe(false);
    expect(faith.prayers.value.prayers).toEqual([]);
    expect(faith.message.value).toBeNull();
  });

  it("a prayer is added, prayed for, answered in the reader's words, and removed", async () => {
    const backend = createDevBackend(ME);
    const faith = createFaith(backend, () => !!backend.identity());
    await faith.refresh();
    expect(
      await faith.savePrayer({ label: "Mom's surgery", prayingFor: "my mom" })
    ).toBe(true);
    const [p] = faith.prayers.value.prayers;
    expect(p).toMatchObject({
      label: "Mom's surgery",
      status: "expressed",
      visibility: "Confidential",
      prayedCount: 0,
    });
    await faith.savePrayer({ id: p!.id, prayed: true });
    expect(faith.prayers.value.prayers[0]!.prayedCount).toBe(1);
    await faith.savePrayer({ id: p!.id, answered: "It went well" });
    expect(faith.prayers.value.prayers[0]).toMatchObject({
      status: "fulfilled",
      answered: { description: "It went well" },
    });
    expect(faith.message.value).toEqual({
      text: "Answered — kept with your words.",
      error: false,
    });
    await faith.savePrayer({ id: p!.id, remove: true });
    expect(faith.prayers.value.prayers).toEqual([]);
  });

  it("a stage said becomes the current one, with next steps; a milestone can be taken back", async () => {
    const backend = createDevBackend(ME);
    const faith = createFaith(backend, () => !!backend.identity());
    await faith.recordJourney({ stage: "NewBeliever" });
    expect(faith.journey.value.stage?.stage).toBe("NewBeliever");
    expect(faith.journey.value.nextSteps.map((s) => s.value)).toEqual([
      "Bible",
      "Prayer",
      "JoinedGroup",
    ]);
    await faith.recordJourney({ milestone: "Baptized", place: "Calvary" });
    const [m] = faith.journey.value.milestones;
    expect(m).toMatchObject({ milestone: "Baptized", place: "Calvary" });
    await faith.recordJourney({ remove: m!.id });
    expect(faith.journey.value.milestones).toEqual([]);
  });

  it("a call that fails is said, and the page keeps what it had", async () => {
    const backend = createDevBackend(ME);
    const faith = createFaith(backend, () => !!backend.identity());
    await faith.savePrayer({ label: "Kept" });
    backend.setOffline(true);
    expect(await faith.savePrayer({ label: "Not kept" })).toBe(false);
    expect(faith.message.value).toEqual({
      text: "the reader workspace could not be reached",
      error: true,
    });
    expect(faith.prayers.value.prayers.map((p) => p.label)).toEqual(["Kept"]);
  });
});
