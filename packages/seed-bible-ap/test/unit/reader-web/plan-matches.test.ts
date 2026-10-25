// The started plans a chapter belongs to: a reading that takes in the chapter (a span of chapters too), whether
// each is ticked, and whether a plan's are all ticked; a plan not started, or a reading of another book, is left out.
import { describe, expect, it } from "vitest";
import { plansOnChapter } from "../../../apps/reader-web/src/state/library/planMatches";
import type { PlanView } from "../../../apps/reader-web/src/state/library/plans";

const reading = (id: string, aboutPassage: string) => ({
  "@id": id,
  item: { "@type": "seed:ScriptureItem", aboutPassage },
});
const view = (
  id: string,
  sessions: { id: string; readings: ReturnType<typeof reading>[] }[],
  done: Record<string, string[]> | null
) =>
  ({
    plan: {
      "@id": id,
      label: `Plan ${id}`,
      hasSession: sessions.map((s) => ({ "@id": s.id, readings: s.readings })),
    },
    progress: done
      ? {
          sessions: Object.entries(done).map(([session, completed]) => ({
            session,
            completed,
          })),
        }
      : null,
    done: 0,
    total: 0,
    todayIndex: null,
  }) as unknown as PlanView;

describe("the plans a chapter belongs to", () => {
  it("finds a reading of the chapter, or of a span of chapters that takes it in", () => {
    const views = [
      view("a", [{ id: "a1", readings: [reading("r1", "JHN.3")] }], {}),
      view("b", [{ id: "b1", readings: [reading("r2", "JHN.1-JHN.10")] }], {
        b1: ["r2"],
      }),
      view("c", [{ id: "c1", readings: [reading("r3", "ROM.8")] }], {}),
      view("d", [{ id: "d1", readings: [reading("r4", "JHN.3")] }], null),
    ];
    const found = plansOnChapter(views, "JHN.3");
    expect(found.map((m) => [m.planId, m.allComplete])).toEqual([
      ["a", false],
      ["b", true],
    ]);
    expect(plansOnChapter(views, "JHN.11")).toEqual([]);
  });

  it("a plan is complete here only when every reading of this chapter is ticked", () => {
    const v = view(
      "e",
      [
        { id: "e1", readings: [reading("x", "JHN.3.1-JHN.3.15")] },
        { id: "e2", readings: [reading("y", "JHN.3.16-JHN.3.36")] },
      ],
      { e1: ["x"] }
    );
    const [m] = plansOnChapter([v], "JHN.3");
    expect(m!.readings.map((r) => r.done)).toEqual([true, false]);
    expect(m!.allComplete).toBe(false);
  });
});
