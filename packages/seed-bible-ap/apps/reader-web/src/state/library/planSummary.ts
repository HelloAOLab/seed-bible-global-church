// A PLAN AT A GLANCE — the old reader's summarizeCalendar and estimateReadingMinutes: each session as a reading day
// (dated from the start at the plan's cadence; self-paced has an order but no dates), how many are done, the streak of
// days kept, how many past days were missed, the next one to read, the last day, and about how long a day takes.
import type {
  PlanProgress,
  PlaylistItem,
  ReadingPlan,
} from "@seed/seed-schema";

const DAY_MS = 86_400_000;
/** The old reader's reading pace and the verses it assumes for a chapter it cannot measure. */
const VERSES_PER_MINUTE = 8;
const FALLBACK_VERSES_PER_CHAPTER = 24;

export interface PlanDay {
  index: number;
  sessionId: string;
  /** The day it falls on (midnight, local); null when self-paced. */
  date: Date | null;
  done: boolean;
  isToday: boolean;
}

export interface PlanSummary {
  selfPaced: boolean;
  days: PlanDay[];
  doneDays: number;
  streak: number;
  behind: number;
  next: PlanDay | null;
  today: PlanDay | null;
  startedAt: Date | null;
  endsAt: Date | null;
  minutesPerDay: number;
}

const midnight = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** About how many minutes a set of readings takes (the old reader's estimate). */
export function readingMinutes(
  items: PlaylistItem[],
  bookLength: (
    bookId: string
  ) => { numberOfChapters: number; totalNumberOfVerses: number } | null
): number {
  let verses = 0;
  for (const it of items) {
    if (it["@type"] !== "seed:ScriptureItem") {
      verses += FALLBACK_VERSES_PER_CHAPTER;
      continue;
    }
    const [from, to] = it.aboutPassage.split("-");
    const [book, ch, v] = (from ?? "").split(".");
    const [, toCh, toV] = (to ?? "").split(".");
    const chapters = Math.max(1, Number(toCh ?? ch) - Number(ch) + 1);
    const len = bookLength(book ?? "");
    const perChapter =
      len && len.numberOfChapters > 0
        ? len.totalNumberOfVerses / len.numberOfChapters
        : FALLBACK_VERSES_PER_CHAPTER;
    if (chapters === 1 && v)
      verses += Math.max(1, Number(toV ?? v) - Number(v) + 1);
    else verses += chapters * perChapter;
  }
  return Math.max(1, Math.round(verses / VERSES_PER_MINUTE));
}

export function planSummary(
  plan: ReadingPlan,
  progress: PlanProgress | null,
  now: number,
  bookLength: Parameters<typeof readingMinutes>[1] = () => null
): PlanSummary {
  const cadence =
    plan.cadenceOptions.find((c) => c["@id"] === progress?.selectedCadence) ??
    plan.cadenceOptions.find((c) => c["@id"] === plan.defaultCadence) ??
    plan.cadenceOptions[0]!;
  const selfPaced = !!progress?.selfPaced || cadence.daysPerSession === 0;
  const startedAt = progress ? midnight(new Date(progress.startedAt)) : null;
  const today = midnight(new Date(now)).getTime();
  const days: PlanDay[] = plan.hasSession.map((s, index) => {
    const sp = progress?.sessions.find((x) => x.session === s["@id"]);
    const done =
      !!sp &&
      (!!sp.completedAt ||
        (s.readings.length > 0 && sp.completed.length >= s.readings.length));
    const date =
      startedAt && !selfPaced
        ? new Date(
            startedAt.getTime() + index * cadence.daysPerSession * DAY_MS
          )
        : null;
    return {
      index,
      sessionId: s["@id"],
      date,
      done,
      isToday: !!date && date.getTime() === today,
    };
  });
  const doneDays = days.filter((d) => d.done).length;
  let behind = 0;
  let streak = 0;
  if (!selfPaced && startedAt) {
    for (const d of days)
      if (d.date && d.date.getTime() < today && !d.done) behind++;
    const due = days.filter((d) => d.date && d.date.getTime() <= today);
    for (let i = due.length - 1; i >= 0; i--) {
      if (due[i]!.done) streak++;
      // Today can still be pending without breaking the run before it.
      else if (i === due.length - 1) continue;
      else break;
    }
  }
  const next = days.find((d) => !d.done) ?? null;
  const minutes = plan.hasSession.length
    ? Math.round(
        plan.hasSession.reduce(
          (n, s) =>
            n +
            readingMinutes(
              s.readings.map((r) => r.item),
              bookLength
            ),
          0
        ) / plan.hasSession.length
      )
    : 0;
  return {
    selfPaced,
    days,
    doneDays,
    streak,
    behind,
    next,
    today: days.find((d) => d.isToday) ?? null,
    startedAt,
    endsAt: days[days.length - 1]?.date ?? null,
    minutesPerDay: minutes,
  };
}
