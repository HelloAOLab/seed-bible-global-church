// EDITING A READING PLAN — the old ReadingPlanEditor's moves as pure changes to a plan: its name and description,
// sessions (days) added, removed, renamed and reordered, readings added, changed, removed and reordered within a
// day, and which paces it offers. Existing session and reading ids never change, so a reader's progress (which
// names them) survives an edit; new ones get fresh ids. A removed reading's tick simply no longer counts.
import type { PlaylistItem, ReadingPlan } from "@seed/seed-schema";
import { newOpId } from "../records/marks";

type PlanSession = ReadingPlan["hasSession"][number];
type CadenceOption = ReadingPlan["cadenceOptions"][number];

/** The paces an author can offer (the old built-ins that fit whole days per session, and self-paced). */
export const PLAN_CADENCES: CadenceOption[] = [
  {
    "@type": "seed:CadenceOption",
    "@id": "daily",
    label: "Daily",
    daysPerSession: 1,
  },
  {
    "@type": "seed:CadenceOption",
    "@id": "every-other-day",
    label: "Every other day",
    daysPerSession: 2,
  },
  {
    "@type": "seed:CadenceOption",
    "@id": "weekly",
    label: "Weekly",
    daysPerSession: 7,
  },
  {
    "@type": "seed:CadenceOption",
    "@id": "self-paced",
    label: "Self-paced",
    daysPerSession: 0,
  },
];

const fresh = (plan: ReadingPlan, what: "s" | "r") =>
  `${plan["@id"]}:${what}-${newOpId().slice(-10)}`;

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

const withSessions = (
  plan: ReadingPlan,
  hasSession: PlanSession[]
): ReadingPlan => ({
  ...plan,
  hasSession,
});

const editSession = (
  plan: ReadingPlan,
  si: number,
  fn: (s: PlanSession) => PlanSession
): ReadingPlan =>
  withSessions(
    plan,
    plan.hasSession.map((s, i) => (i === si ? fn(s) : s))
  );

export function setDetails(
  plan: ReadingPlan,
  label: string,
  description: string
): ReadingPlan {
  const next: ReadingPlan = { ...plan, label: label.trim() || plan.label };
  if (description.trim()) next.description = description.trim();
  else delete next.description;
  return next;
}

export const addSession = (plan: ReadingPlan): ReadingPlan =>
  withSessions(plan, [
    ...plan.hasSession,
    { "@type": "seed:PlanSession", "@id": fresh(plan, "s"), readings: [] },
  ]);

export const removeSession = (plan: ReadingPlan, si: number): ReadingPlan =>
  withSessions(
    plan,
    plan.hasSession.filter((_, i) => i !== si)
  );

export const moveSession = (plan: ReadingPlan, si: number, dir: -1 | 1) =>
  withSessions(plan, move(plan.hasSession, si, dir));

export const renameSession = (plan: ReadingPlan, si: number, label: string) =>
  editSession(plan, si, (s) => {
    const next = { ...s };
    if (label.trim()) next.label = label.trim();
    else delete next.label;
    return next;
  });

export const addReading = (plan: ReadingPlan, si: number, item: PlaylistItem) =>
  editSession(plan, si, (s) => ({
    ...s,
    readings: [
      ...s.readings,
      { "@type": "seed:PlanReading", "@id": fresh(plan, "r"), item },
    ],
  }));

export const updateReading = (
  plan: ReadingPlan,
  si: number,
  ri: number,
  item: PlaylistItem
) =>
  editSession(plan, si, (s) => ({
    ...s,
    readings: s.readings.map((r, i) => (i === ri ? { ...r, item } : r)),
  }));

export const removeReading = (plan: ReadingPlan, si: number, ri: number) =>
  editSession(plan, si, (s) => ({
    ...s,
    readings: s.readings.filter((_, i) => i !== ri),
  }));

export const moveReading = (
  plan: ReadingPlan,
  si: number,
  ri: number,
  dir: -1 | 1
) =>
  editSession(plan, si, (s) => ({ ...s, readings: move(s.readings, ri, dir) }));

/**
 * Offer or stop offering a pace. A plan always offers at least one; its default moves to the first one left when
 * the default is taken away.
 */
export function toggleCadence(plan: ReadingPlan, id: string): ReadingPlan {
  const offered = plan.cadenceOptions.some((c) => c["@id"] === id);
  const cadenceOptions = offered
    ? plan.cadenceOptions.filter((c) => c["@id"] !== id)
    : PLAN_CADENCES.filter(
        (c) =>
          c["@id"] === id ||
          plan.cadenceOptions.some((o) => o["@id"] === c["@id"])
      );
  if (!cadenceOptions.length) return plan;
  const defaultCadence = cadenceOptions.some(
    (c) => c["@id"] === plan.defaultCadence
  )
    ? plan.defaultCadence
    : cadenceOptions[0]!["@id"];
  return { ...plan, cadenceOptions, defaultCadence };
}

/** What stops a plan from being saved, or null: it needs a name and at least one reading. */
export function planProblem(plan: ReadingPlan): "name" | "readings" | null {
  if (!plan.label.trim()) return "name";
  if (!plan.hasSession.some((s) => s.readings.length)) return "readings";
  return null;
}
