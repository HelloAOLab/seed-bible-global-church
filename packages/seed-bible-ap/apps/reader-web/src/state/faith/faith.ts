// THE READER'S FAITH LIFE — their journey (where they say they are, the milestones they reached, next steps), their
// prayers (requests, thanksgivings, answers) and the care they ask their church for. Kept by THEIR agent in THEIR
// vault as the faith ontology's records (person.faith.* — faith.ttl "The person's own faith records"); this module
// holds the last answer to show and sends the reader's acts. Nothing here decides who may see what: each record
// carries its own visibility, and the reader's agent applies it.
import { computed, signal } from "@preact/signals";

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

/** A church on FaithNet: a `.church` name (ap-church spec 203 §1). */
export interface DirectoryChurch {
  agent: string;
  name: string;
  displayName: string;
  description?: string;
  describable: boolean;
}
export interface ChurchSite {
  id: string;
  name: string;
  address?: Partial<
    Record<
      | "streetAddress"
      | "addressLocality"
      | "addressRegion"
      | "postalCode"
      | "addressCountry",
      string
    >
  >;
  timezone?: string;
  website?: string;
  services?: Array<{ day: string; time: string; durationMinutes?: number }>;
}
/** What a church says of itself in `church.describe` (spec 203 §2). */
export interface ChurchDescription {
  church: {
    agent: string;
    name: string;
    displayName: string;
    description?: string;
    website?: string;
    timezone?: string;
  };
  sites: ChurchSite[];
}
/** The reader's church and site, kept by their agent — the record the Church app reads too (spec 203 §3). */
export interface ChurchHome {
  churches: Array<{
    agent: string;
    name: string;
    displayName?: string;
    site: { id: string; name: string } | null;
  }>;
  defaultChurch: string | null;
}
export interface ChurchHomeSaveArgs {
  churches: Array<{ agent: string; name: string; site: string | null }>;
  defaultChurch: string | null;
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
  /** FaithNet's churches: the `.church` names. */
  churchDirectory(): Promise<DirectoryChurch[]>;
  /** A church's own description and sites, asked of it. */
  describeChurch(name: string): Promise<ChurchDescription>;
  faithChurchHome(): Promise<ChurchHome>;
  faithSaveChurchHome(args: ChurchHomeSaveArgs): Promise<{ answer?: string }>;
}

const EMPTY_HOME: ChurchHome = { churches: [], defaultChurch: null };

const EMPTY_JOURNEY: JourneyView = {
  stage: null,
  history: [],
  milestones: [],
  nextSteps: [],
};

type Prefs = {
  get(k: string): Promise<unknown>;
  set(k: string, v: unknown): Promise<void>;
  delete(k: string): Promise<void>;
};

export function createFaith(
  backend: FaithBackend,
  signedIn: () => boolean,
  prefs?: Prefs
) {
  const journey = signal<JourneyView>(EMPTY_JOURNEY);
  const prayers = signal<PrayersView>({ prayers: [], care: [] });
  /** The churches the reader's Home links them to. */
  const linked = signal<Church[]>([]);
  /** The church and site the reader chose, as their agent keeps it. */
  const home = signal<ChurchHome>(EMPTY_HOME);
  /** Who a prayer or care request can go to: the churches they chose (default first), then their Home's links. */
  const churches = computed<Church[]>(() => {
    const h = home.value;
    const chosen = [...h.churches]
      .sort(
        (a, b) =>
          Number(b.agent === h.defaultChurch) -
          Number(a.agent === h.defaultChurch)
      )
      .map((c) => ({ agent: c.agent, name: c.displayName ?? c.name }));
    return [
      ...chosen,
      ...linked.value.filter((l) => !chosen.some((c) => c.agent === l.agent)),
    ];
  });
  const directory = signal<DirectoryChurch[] | null>(null);
  void prefs;
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
      const [j, p, c, h] = await Promise.all([
        backend.faithJourney(),
        backend.faithPrayers(),
        backend.faithChurches().catch(() => [] as Church[]),
        // An agent whose playbook predates church choice answers nothing here; the rest of the page still works.
        backend.faithChurchHome().catch(() => EMPTY_HOME),
      ]);
      journey.value = j;
      prayers.value = p;
      linked.value = c;
      home.value = h;
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
    churchHome: home,
    directory,
    /** FaithNet's churches, read once a session; a failure said in `message`. */
    async loadDirectory(): Promise<DirectoryChurch[]> {
      if (directory.value) return directory.value;
      try {
        directory.value = await backend.churchDirectory();
      } catch (e) {
        message.value = { text: errorText(e), error: true };
        return [];
      }
      return directory.value;
    },
    async describeChurch(name: string): Promise<ChurchDescription | null> {
      try {
        return await backend.describeChurch(name);
      } catch (e) {
        message.value = { text: errorText(e), error: true };
        return null;
      }
    },
    /** Make `church` (at `site`, or all its sites) the reader's church; the other churches they chose stay. */
    chooseChurch(church: { agent: string; name: string }, site: string | null) {
      const others = home.value.churches
        .filter((c) => c.agent !== church.agent)
        .map((c) => ({
          agent: c.agent,
          name: c.name,
          site: c.site?.id ?? null,
        }));
      return act(() =>
        backend.faithSaveChurchHome({
          churches: [
            { agent: church.agent, name: church.name, site },
            ...others,
          ],
          defaultChurch: church.agent,
        })
      );
    },
  };
}

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // An agent whose playbook or storage grant predates faith records answers in its own words. Opening the Home once
  // moves both forward (its ensure-playbook self-heal and grant coverage check), so say that, plainly.
  if (
    /not a capability|unknown[_ ]tool|no tool|not offered|person\.faith|grant predates|record_scope_denied|session_leaf_required/i.test(
      m
    )
  )
    // The agent's own words go along: "update the playbook" and "refresh the grant" are different presses at the Home.
    return `Your agent needs a quick update before it can save your prayers, journey and milestones. Open your Home at www.faithnet.me once while signed in, then come back here and try again. (Your agent said: "${m.slice(0, 240)}")`;
  return m;
}

export type Faith = ReturnType<typeof createFaith>;
