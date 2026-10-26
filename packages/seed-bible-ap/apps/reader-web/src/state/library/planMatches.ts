// THE PLANS A CHAPTER BELONGS TO — the old reader's "This reading belongs to" (ReadingPlansSection): the started
// plans with a scripture reading that takes in the chapter on screen, each reading with whether it is ticked, and
// whether all of a plan's are. A reading "John 1–10" takes in John 4.
import type { PlanView } from "./plans";

export interface PlanMatch {
  planId: string;
  title: string;
  readings: { sessionId: string; readingId: string; done: boolean }[];
  allComplete: boolean;
}

/** "JHN.3" for "JHN.3.16-JHN.3.18" or "JHN.3": [book, first chapter, last chapter]. */
function chaptersOf(passage: string): [string, number, number] | null {
  const [from, to] = passage.split("-");
  const [book, ch] = (from ?? "").split(".");
  const [toBook, toCh] = (to ?? "").split(".");
  const first = Number(ch);
  if (!book || !Number.isFinite(first)) return null;
  const last = to && toBook === book ? Number(toCh) : first;
  return [book, first, Number.isFinite(last) ? last : first];
}

export function plansOnChapter(
  views: readonly PlanView[],
  chapterRef: string
): PlanMatch[] {
  const [book, chapter] = chapterRef.split(".");
  const n = Number(chapter);
  const out: PlanMatch[] = [];
  for (const v of views) {
    if (!v.progress) continue;
    const readings: PlanMatch["readings"] = [];
    for (const s of v.plan.hasSession)
      for (const r of s.readings) {
        if (r.item["@type"] !== "seed:ScriptureItem") continue;
        const span = chaptersOf(r.item.aboutPassage);
        if (!span || span[0] !== book || n < span[1] || n > span[2]) continue;
        const sp = v.progress.sessions.find((x) => x.session === s["@id"]);
        readings.push({
          sessionId: s["@id"],
          readingId: r["@id"],
          done: !!sp && (!!sp.completedAt || sp.completed.includes(r["@id"])),
        });
      }
    if (readings.length)
      out.push({
        planId: v.plan["@id"],
        title: v.plan.label,
        readings,
        allComplete: readings.every((r) => r.done),
      });
  }
  return out;
}
