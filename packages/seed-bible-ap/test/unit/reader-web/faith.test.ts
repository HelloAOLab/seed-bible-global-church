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

  const CALVARY = "0x863bd39e938ac593c8d67a11f2f6c12d824b2526";
  const calvary = {
    church: {
      agent: CALVARY,
      name: "calvary-bible-co.church",
      displayName: "Calvary Bible Church",
    },
    sites: [
      { id: "campus_erie", name: "Erie" },
      { id: "campus_boulder", name: "Boulder" },
    ],
  };

  it("a church and site chosen from FaithNet's churches is kept by the agent and offered for care", async () => {
    const backend = createDevBackend(ME);
    backend.churchesOnFaithNet.push(calvary);
    const faith = createFaith(backend, () => !!backend.identity());
    expect((await faith.loadDirectory()).map((c) => c.name)).toEqual([
      "calvary-bible-co.church",
    ]);
    expect(
      (await faith.describeChurch("calvary-bible-co.church"))?.sites
    ).toHaveLength(2);
    expect(
      await faith.chooseChurch(
        { agent: CALVARY, name: "calvary-bible-co.church" },
        "campus_erie"
      )
    ).toBe(true);
    expect(faith.churchHome.value).toEqual({
      churches: [
        {
          agent: CALVARY,
          name: "calvary-bible-co.church",
          displayName: "Calvary Bible Church",
          site: { id: "campus_erie", name: "Erie" },
        },
      ],
      defaultChurch: CALVARY,
    });
    expect(faith.churches.value).toEqual([
      { agent: CALVARY, name: "Calvary Bible Church" },
    ]);
    // Another device, the same agent: the choice is there without choosing again.
    const elsewhere = createFaith(backend, () => !!backend.identity());
    await elsewhere.refresh();
    expect(elsewhere.churchHome.value.churches[0]?.site?.id).toBe(
      "campus_erie"
    );
  });

  it("a site the church does not list is refused in words, and nothing is kept", async () => {
    const backend = createDevBackend(ME);
    backend.churchesOnFaithNet.push(calvary);
    const faith = createFaith(backend, () => !!backend.identity());
    expect(
      await faith.chooseChurch(
        { agent: CALVARY, name: "calvary-bible-co.church" },
        "campus_mars"
      )
    ).toBe(false);
    expect(faith.message.value?.text).toMatch(/has no site campus_mars/);
    expect(faith.churchHome.value.churches).toEqual([]);
  });

  it("choosing another church keeps the churches chosen before, and makes the new one the default", async () => {
    const backend = createDevBackend(ME);
    const evans = {
      church: {
        agent: "0x" + "e".repeat(40),
        name: "evans-somali-house.church",
        displayName: "Evans Somali house church",
      },
      sites: [],
    };
    backend.churchesOnFaithNet.push(calvary, evans);
    const faith = createFaith(backend, () => !!backend.identity());
    await faith.chooseChurch(
      { agent: CALVARY, name: "calvary-bible-co.church" },
      null
    );
    await faith.chooseChurch(
      { agent: evans.church.agent, name: evans.church.name },
      null
    );
    expect(faith.churchHome.value.defaultChurch).toBe(evans.church.agent);
    expect(faith.churches.value.map((c) => c.name)).toEqual([
      "Evans Somali house church",
      "Calvary Bible Church",
    ]);
  });
});
