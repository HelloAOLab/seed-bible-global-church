// THE READER'S FAITH LIFE — their journey (where they say they are, the milestones they reached, next steps), their
// prayers (requests, thanksgivings, answers) and the care they ask their church for. Kept by THEIR agent in THEIR
// vault as the faith ontology's records (person.faith.* — faith.ttl "The person's own faith records"); this module
// holds the last answer to show and sends the reader's acts. Nothing here decides who may see what: each record
// carries its own visibility, and the reader's agent applies it.
import { signal } from "@preact/signals";

/** fci:FaithJourneyStageValue notations, in journey order (faith.data.ttl). */
export const STAGES = [
  "Seeker",
  "GospelClarity",
  "Conversion",
  "NewBeliever",
  "Connected",
  "Growing",
  "Serving",
  "Multiplying",
  "Leader",
] as const;
export type Stage = (typeof STAGES)[number];
/** fci:FaithMilestoneValue notations. */
export const MILESTONES = [
  "UnderstoodGospel",
  "ProfessionOfFaith",
  "Baptized",
  "JoinedGroup",
  "FoundationsClass",
  "StartedServing",
  "SharedTestimony",
] as const;
export type Milestone = (typeof MILESTONES)[number];
/** fci:PrayerVisibilityValue notations — a disclosure control, Confidential unless the reader widens it. */
export const VISIBILITIES = [
  "Confidential",
  "Friends",
  "LeadersOnly",
  "BodyOnly",
  "Open",
] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export type PrayerStatus = "expressed" | "fulfilled" | "withdrawn";

export interface JourneyView {
  stage: {
    stage: Stage;
    label: string;
    assertedAt: string;
    note?: string;
    visibility: Visibility;
  } | null;
  history: Array<{ stage: Stage; assertedAt: string }>;
  milestones: Array<{
    id: string;
    milestone: Milestone;
    label: string;
    occurredOn?: string;
    place?: string;
    note?: string;
    visibility: Visibility;
  }>;
  nextSteps: Array<{
    kind: "milestone" | "practice";
    value: string;
    label: string;
    strength: "requires" | "recommends";
    forStage: string;
  }>;
}

export interface Prayer {
  id: string;
  label: string;
  description?: string;
  kind: "Request" | "Thanksgiving";
  status: PrayerStatus;
  visibility: Visibility;
  sharedWith?: string[];
  prayingFor?: string;
  passage?: string;
  prayedCount: number;
  lastPrayedAt?: string;
  answered?: { description?: string; answeredAt: string };
  createdAt: string;
}
export interface CareRequest {
  id: string;
  label: string;
  description?: string;
  urgency: "Low" | "Normal" | "High";
  status: PrayerStatus;
  sharedWith?: string[];
  safeToText?: boolean;
  createdAt: string;
}
export interface PrayersView {
  prayers: Prayer[];
  care: CareRequest[];
}
export interface Church {
  agent: string;
  name: string;
}

export interface JourneyRecordArgs {
  stage?: Stage;
  milestone?: Milestone;
  occurredOn?: string;
  place?: string;
  note?: string;
  visibility?: Visibility;
  sharedWith?: string[];
  remove?: string;
}
export interface PrayerSaveArgs {
  id?: string;
  label?: string;
  description?: string;
  kind?: "Request" | "Thanksgiving";
  prayingFor?: string;
  passage?: string;
  visibility?: Visibility;
  sharedWith?: string[];
  prayed?: boolean;
  answered?: string;
  status?: PrayerStatus;
  remove?: boolean;
}
export interface CareRequestArgs {
  id?: string;
  label?: string;
  description?: string;
  urgency?: "Low" | "Normal" | "High";
  safeToText?: boolean;
  church?: string;
  withdraw?: boolean;
}

/** What the backend asks of the reader's agent for this module. */
export interface FaithBackend {
  faithJourney(): Promise<JourneyView>;
  faithRecordJourney(args: JourneyRecordArgs): Promise<{ answer?: string }>;
  faithPrayers(): Promise<PrayersView>;
  faithSavePrayer(args: PrayerSaveArgs): Promise<{ answer?: string }>;
  faithRequestCare(args: CareRequestArgs): Promise<{ answer?: string }>;
  faithChurches(): Promise<Church[]>;
}

const EMPTY_JOURNEY: JourneyView = {
  stage: null,
  history: [],
  milestones: [],
  nextSteps: [],
};

export function createFaith(backend: FaithBackend, signedIn: () => boolean) {
  const journey = signal<JourneyView>(EMPTY_JOURNEY);
  const prayers = signal<PrayersView>({ prayers: [], care: [] });
  const churches = signal<Church[]>([]);
  const loading = signal(false);
  const loaded = signal(false);
  /** What the reader's agent said about the last act (or why it failed), in its words. */
  const message = signal<{ text: string; error: boolean } | null>(null);

  async function refresh() {
    if (!signedIn()) {
      journey.value = EMPTY_JOURNEY;
      prayers.value = { prayers: [], care: [] };
      loaded.value = false;
      return;
    }
    loading.value = true;
    try {
      const [j, p, c] = await Promise.all([
        backend.faithJourney(),
        backend.faithPrayers(),
        backend.faithChurches().catch(() => [] as Church[]),
      ]);
      journey.value = j;
      prayers.value = p;
      churches.value = c;
      loaded.value = true;
    } catch (e) {
      message.value = { text: errorText(e), error: true };
    } finally {
      loading.value = false;
    }
  }

  /** One act at the reader's agent, then a fresh read, so the page shows what the vault now holds. */
  async function act(run: () => Promise<{ answer?: string }>) {
    try {
      const r = await run();
      message.value = r.answer ? { text: r.answer, error: false } : null;
      await refresh();
      return true;
    } catch (e) {
      message.value = { text: errorText(e), error: true };
      return false;
    }
  }

  return {
    journey,
    prayers,
    churches,
    loading,
    loaded,
    message,
    refresh,
    recordJourney: (args: JourneyRecordArgs) =>
      act(() => backend.faithRecordJourney(args)),
    savePrayer: (args: PrayerSaveArgs) =>
      act(() => backend.faithSavePrayer(args)),
    requestCare: (args: CareRequestArgs) =>
      act(() => backend.faithRequestCare(args)),
  };
}

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // A runtime that does not offer the faith tools yet answers in its own words; say what that means.
  if (
    /not a capability|unknown tool|no tool|not offered|person\.faith/i.test(m)
  )
    return "Your Home's agent cannot keep faith records yet. Please try again later.";
  return m;
}

export type Faith = ReturnType<typeof createFaith>;
