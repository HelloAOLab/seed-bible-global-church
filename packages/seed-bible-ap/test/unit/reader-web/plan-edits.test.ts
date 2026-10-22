// EDITING A READING PLAN: days and readings are added, renamed, reordered and removed without changing the ids a
// reader's progress names; a plan always offers at least one pace and keeps a default it still offers; a plan
// without a name or a reading cannot be saved.
import { describe, expect, it } from "vitest";
import type { ReadingPlan } from "@seed/seed-schema";
import {
  addReading,
  addSession,
  moveReading,
  moveSession,
  planProblem,
  removeReading,
  removeSession,
  renameSession,
  setDetails,
  toggleCadence,
  updateReading,
} from "../../../apps/reader-web/src/state/library/planEdits";

const item = (p: string) => ({
  "@type": "seed:ScriptureItem" as const,
  aboutPassage: p,
});

function plan(): ReadingPlan {
  return {
    "@id": "urn:seed:plan:p1",
    "@type": "seed:ReadingPlan",
    publishedBy: "0xabc",
    label: "John",
    hasSession: [
      {
        "@type": "seed:PlanSession",
        "@id": "urn:seed:plan:p1:s1",
        readings: [
          {
            "@type": "seed:PlanReading",
            "@id": "urn:seed:plan:p1:s1:r1",
            item: item("JHN.1"),
          },
          {
            "@type": "seed:PlanReading",
            "@id": "urn:seed:plan:p1:s1:r2",
            item: item("JHN.2"),
          },
        ],
      },
      {
        "@type": "seed:PlanSession",
        "@id": "urn:seed:plan:p1:s2",
        readings: [],
      },
    ],
    cadenceOptions: [
      {
        "@type": "seed:CadenceOption",
        "@id": "daily",
        label: "Daily",
        daysPerSession: 1,
      },
      {
        "@type": "seed:CadenceOption",
        "@id": "self-paced",
        label: "Self-paced",
        daysPerSession: 0,
      },
    ],
    defaultCadence: "daily",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  } as ReadingPlan;
}

const ids = (p: ReadingPlan) =>
  p.hasSession.map(
    (s) =>
      `${s["@id"].split(":").pop()}[${s.readings.map((r) => r.item.aboutPassage).join(",")}]`
  );

describe("editing a plan's days and readings", () => {
  it("moves a day and a reading, keeping their ids", () => {
    let p = moveSession(plan(), 0, 1);
    expect(ids(p)).toEqual(["s2[]", "s1[JHN.1,JHN.2]"]);
    p = moveReading(p, 1, 1, -1);
    expect(p.hasSession[1]!.readings.map((r) => r["@id"])).toEqual([
      "urn:seed:plan:p1:s1:r2",
      "urn:seed:plan:p1:s1:r1",
    ]);
  });

  it("ignores a move past either end", () => {
    expect(ids(moveSession(plan(), 0, -1))).toEqual(ids(plan()));
    expect(ids(moveReading(plan(), 0, 1, 1))).toEqual(ids(plan()));
  });

  it("adds a day and a reading with new ids that do not collide", () => {
    let p = addSession(plan());
    p = addReading(p, 2, item("ROM.8.28-ROM.8.39"));
    p = addReading(p, 2, item("ROM.9"));
    expect(ids(p)[2]).toMatch(/\[ROM\.8\.28-ROM\.8\.39,ROM\.9\]$/);
    const all = p.hasSession.flatMap((s) => [
      s["@id"],
      ...s.readings.map((r) => r["@id"]),
    ]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("renames, changes and removes", () => {
    let p = renameSession(plan(), 0, "  The Word  ");
    expect(p.hasSession[0]!.label).toBe("The Word");
    p = renameSession(p, 0, " ");
    expect(p.hasSession[0]!.label).toBeUndefined();
    p = updateReading(p, 0, 1, item("JHN.3"));
    p = removeReading(p, 0, 0);
    p = removeSession(p, 1);
    expect(ids(p)).toEqual(["s1[JHN.3]"]);
    expect(p.hasSession[0]!.readings[0]!["@id"]).toBe("urn:seed:plan:p1:s1:r2");
  });

  it("sets the name and drops an empty description", () => {
    const p = setDetails(
      { ...plan(), description: "old" },
      " Gospel of John ",
      "  "
    );
    expect(p.label).toBe("Gospel of John");
    expect("description" in p).toBe(false);
  });
});

describe("the paces a plan offers", () => {
  it("adds a pace in the built-in order and moves the default off a removed one", () => {
    let p = toggleCadence(plan(), "weekly");
    expect(p.cadenceOptions.map((c) => c["@id"])).toEqual([
      "daily",
      "weekly",
      "self-paced",
    ]);
    p = toggleCadence(p, "daily");
    expect(p.defaultCadence).toBe("weekly");
  });

  it("never leaves a plan with no pace", () => {
    let p = toggleCadence(plan(), "daily");
    p = toggleCadence(p, "self-paced");
    expect(p.cadenceOptions.map((c) => c["@id"])).toEqual(["self-paced"]);
  });
});

describe("whether a plan can be saved", () => {
  it("needs a name and at least one reading", () => {
    expect(planProblem(plan())).toBeNull();
    expect(planProblem({ ...plan(), label: " " })).toBe("name");
    expect(planProblem(removeReading(removeReading(plan(), 0, 0), 0, 0))).toBe(
      "readings"
    );
  });
});
