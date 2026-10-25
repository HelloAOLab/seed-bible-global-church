// A PLAN AT A GLANCE (the old reader's): dated days at the cadence, the streak of kept days (today may still be
// pending), past days missed, the next day, the end date, and minutes a day by verses at 8 a minute.
import { describe, expect, it } from "vitest";
import type { PlanProgress, ReadingPlan } from "@seed/seed-schema";
import { planSummary } from "../../../apps/reader-web/src/state/library/planSummary";

const plan = (n: number): ReadingPlan => ({
  "@id": "urn:seed:plan:p",
  "@type": "seed:ReadingPlan",
  publishedBy: "0x" + "11".repeat(20),
  label: "Plan",
  hasSession: Array.from({ length: n }, (_, i) => ({
    "@type": "seed:PlanSession" as const,
    "@id": `s${i + 1}`,
    readings: [
      {
        "@type": "seed:PlanReading" as const,
        "@id": `s${i + 1}:r1`,
        item: {
          "@type": "seed:ScriptureItem" as const,
          aboutPassage: `JHN.${i + 1}`,
        },
      },
    ],
  })),
  cadenceOptions: [
    {
      "@type": "seed:CadenceOption",
      "@id": "daily",
      label: "Daily",
      daysPerSession: 1,
    },
  ],
  defaultCadence: "daily",
});

const progress = (startedAt: string, done: string[]): PlanProgress => ({
  "@id": "urn:seed:progress:p",
  "@type": "seed:PlanProgress",
  heldBy: "0x" + "11".repeat(20),
  aboutPassage: "JHN.1",
  progressOf: "urn:seed:plan:p",
  selectedCadence: "daily",
  opId: "op",
  startedAt,
  sessions: done.map((s) => ({
    "@type": "seed:SessionProgress" as const,
    session: s,
    completed: [`${s}:r1`],
  })),
});

describe("plan summary", () => {
  it("counts the streak, the days behind, the next day and the end", () => {
    const now = new Date(2026, 9, 25, 10).getTime();
    const started = new Date(2026, 9, 20, 9).toISOString();
    // Days 1–6 are 20–25 Oct; 1 and 2 missed, 3–5 kept, 6 (today) pending.
    const s = planSummary(plan(10), progress(started, ["s3", "s4", "s5"]), now);
    expect(s.doneDays).toBe(3);
    expect(s.behind).toBe(2);
    expect(s.streak).toBe(3);
    expect(s.next?.index).toBe(0);
    expect(s.today?.index).toBe(5);
    expect(s.endsAt?.getDate()).toBe(29);
    expect(s.minutesPerDay).toBe(3);
  });

  it("has no dates, streak or behind when self-paced", () => {
    const p = {
      ...progress(new Date().toISOString(), ["s1"]),
      selfPaced: true,
    };
    const s = planSummary(plan(3), p, Date.now());
    expect(s.selfPaced).toBe(true);
    expect(s.days.every((d) => d.date === null)).toBe(true);
    expect([s.streak, s.behind]).toEqual([0, 0]);
    expect(s.next?.index).toBe(1);
  });
});
