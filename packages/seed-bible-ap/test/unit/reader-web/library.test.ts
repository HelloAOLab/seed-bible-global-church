// Playlists and reading plans as works in the Library, progress as a mark, and publishing a work as a slice the
// registry lists — over the dev backend.
import { describe, expect, it } from "vitest";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";
import { memoryStores } from "../../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../../apps/reader-web/src/state/records/buckets";
import { createPlaylists } from "../../../apps/reader-web/src/state/library/playlists";
import { createPlans } from "../../../apps/reader-web/src/state/library/plans";
import { createPublishing } from "../../../apps/reader-web/src/state/social/publishing";
import { createDiscover } from "../../../apps/reader-web/src/state/social/discover";

const READER = {
  agent: "0x" + "44".repeat(20),
  name: "Seed Reader",
  wire: true,
};

function device(backend = createDevBackend(READER)) {
  const stores = memoryStores();
  const outbox = createOutbox({
    backend,
    stores,
    isOnline: () => true,
    settleMs: 1,
  });
  const buckets = createBucketStore({
    backend,
    stores,
    outbox,
    isOnline: () => true,
  });
  const identity = () => backend.identity();
  return {
    backend,
    stores,
    outbox,
    buckets,
    playlists: createPlaylists(backend, stores, identity),
    plans: createPlans(backend, stores, buckets, identity),
    publishing: createPublishing(backend, stores),
    discover: createDiscover(backend),
  };
}

describe("playlists", () => {
  it("are created, edited, played in order, saved to the Library, and read back on another device", async () => {
    const backend = createDevBackend(READER);
    const a = device(backend);
    const pl = await a.playlists.create("Light", [
      {
        "@type": "seed:ScriptureItem",
        aboutPassage: "JHN.1.1-JHN.1.5",
        ofEdition: "BSB",
      },
    ]);
    await a.playlists.addItem(pl["@id"], {
      "@type": "seed:HtmlItem",
      label: "Why",
      html: "<p>Because</p>",
    });
    await a.playlists.addItem(pl["@id"], {
      "@type": "seed:ScriptureItem",
      aboutPassage: "JHN.8.12",
      ofEdition: "BSB",
    });
    await a.playlists.moveItem(pl["@id"], 2, 1);
    expect(a.playlists.byId(pl["@id"])!.hasItem.map((i) => i["@type"])).toEqual(
      ["seed:ScriptureItem", "seed:ScriptureItem", "seed:HtmlItem"]
    );
    a.playlists.play(pl["@id"]);
    expect(a.playlists.current.value?.index).toBe(0);
    a.playlists.next();
    a.playlists.next();
    expect(a.playlists.current.value?.item["@type"]).toBe("seed:HtmlItem");
    a.playlists.next();
    expect(a.playlists.current.value?.index).toBe(2);
    a.playlists.stop();
    expect(a.playlists.playing.value).toBeNull();
    expect([...backend.works.keys()]).toEqual([
      `${READER.agent}:seed-bible/playlists/${a.playlists.nameOf(pl["@id"])}`,
    ]);

    const b = device(backend);
    await b.playlists.refresh();
    expect(b.playlists.live().map((p) => p.label)).toEqual(["Light"]);
    await b.playlists.remove(pl["@id"]);
    await a.playlists.refresh();
    expect(a.playlists.live()).toHaveLength(0);
  });

  it("publish as a slice the registry lists under the first passage's chapter", async () => {
    const d = device();
    const pl = await d.playlists.create("Light", [
      {
        "@type": "seed:ScriptureItem",
        aboutPassage: "JHN.8.12",
        ofEdition: "BSB",
      },
    ]);
    await d.publishing.publishWork(pl);
    await d.discover.refresh("JHN.8");
    const rows = d.discover.forChapter("JHN.8").value!.offerings;
    expect(rows.map((o) => [o.kind, o.title])).toEqual([["playlist", "Light"]]);
    await d.publishing.withdrawWork(pl["@id"], "playlist");
    await d.discover.refresh("JHN.8");
    expect(d.discover.forChapter("JHN.8").value!.offerings).toHaveLength(0);
  });
});

describe("reading plans", () => {
  it("come from a run of chapters; starting one keeps progress as a mark that flushes like any other", async () => {
    const d = device();
    const plan = await d.plans.createFromChapters(
      "John in three days",
      "BSB",
      "JHN",
      1,
      3
    );
    expect(plan.hasSession).toHaveLength(3);
    expect(d.plans.views.value[0]!.total).toBe(3);
    expect(d.plans.views.value[0]!.progress).toBeNull();
    await d.plans.start(plan["@id"], "daily");
    let v = d.plans.view(plan);
    expect(v.progress?.selectedCadence).toBe("daily");
    expect(v.todayIndex).toBe(0);
    const s1 = plan.hasSession[0]!;
    await d.plans.setDone(plan["@id"], s1["@id"], s1.readings[0]!["@id"], true);
    v = d.plans.view(plan);
    expect(v.done).toBe(1);
    expect(v.progress?.sessions[0]?.completedAt).toBeTruthy();
    await d.outbox.flush();
    const lib = d.backend.buckets.get("progress:progress")!["@graph"];
    expect(lib).toHaveLength(1);
    expect(lib[0]).toMatchObject({
      "@type": "seed:PlanProgress",
      progressOf: plan["@id"],
    });
    await d.plans.setDone(
      plan["@id"],
      s1["@id"],
      s1.readings[0]!["@id"],
      false
    );
    expect(d.plans.view(plan).done).toBe(0);
    await d.plans.reset(plan["@id"]);
    expect(d.plans.view(plan).progress).toBeNull();
  });

  it("self-paced plans point at the first unfinished session", async () => {
    const d = device();
    const plan = await d.plans.createFromChapters("Self", "BSB", "JHN", 1, 2);
    await d.plans.start(plan["@id"], "self-paced");
    const s1 = plan.hasSession[0]!;
    await d.plans.setDone(plan["@id"], s1["@id"], s1.readings[0]!["@id"], true);
    expect(d.plans.view(plan).todayIndex).toBe(1);
  });
});
