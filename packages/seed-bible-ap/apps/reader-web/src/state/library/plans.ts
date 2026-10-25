// READING PLANS — a plan is sessions of readings with cadence options (seed:ReadingPlan, a private work);
// progress is the reader's own mark (seed:PlanProgress in the `progress` bucket), which syncs like any mark.
// The first cut's cadence: one session every N days from the start, or self-paced.
import { computed } from "@preact/signals";
import {
  ReadingPlan,
  type PlanProgress,
  type PlaylistItem,
} from "@seed/seed-schema";
import type { ReaderBackend } from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { LOCAL_AGENT, type BucketStore } from "../records/buckets";
import { newOpId, nowIso } from "../records/marks";
import { createWorks } from "./works";

export interface PlanView {
  plan: ReadingPlan;
  progress: PlanProgress | null;
  done: number;
  total: number;
  /** The session due today at the chosen cadence (self-paced: the first not finished). */
  todayIndex: number | null;
}

export function createPlans(
  backend: ReaderBackend,
  stores: ReaderStores,
  buckets: BucketStore,
  identity: () => { agent: string } | null
) {
  const works = createWorks<ReadingPlan>(
    "seed-bible/plans",
    backend,
    stores,
    (raw) => ReadingPlan.parse(raw)
  );
  const bucket = buckets.get("progress");
  const progressItems = computed(() =>
    (bucket.bucket.value["@graph"] as PlanProgress[]).filter(
      (it) => it["@type"] === "seed:PlanProgress" && !it.deleted
    )
  );
  const progressOf = (planId: string) =>
    progressItems.value.find((p) => p.progressOf === planId) ?? null;

  const views = computed<PlanView[]>(() =>
    works.live().map((plan) => view(plan))
  );

  function view(plan: ReadingPlan): PlanView {
    const progress = progressOf(plan["@id"]);
    const total = plan.hasSession.reduce((n, s) => n + s.readings.length, 0);
    const done =
      progress?.sessions.reduce((n, s) => n + s.completed.length, 0) ?? 0;
    let todayIndex: number | null = null;
    if (progress) {
      const cadence =
        plan.cadenceOptions.find(
          (c) => c["@id"] === progress.selectedCadence
        ) ?? plan.cadenceOptions[0]!;
      if (progress.selfPaced || cadence.daysPerSession === 0) {
        const i = plan.hasSession.findIndex((s) => {
          const sp = progress.sessions.find((x) => x.session === s["@id"]);
          return !sp || sp.completed.length < s.readings.length;
        });
        todayIndex = i >= 0 ? i : null;
      } else {
        const days = Math.floor(
          (Date.now() - new Date(progress.startedAt).getTime()) / 86_400_000
        );
        const i = Math.floor(days / cadence.daysPerSession);
        todayIndex = i < plan.hasSession.length ? i : null;
      }
    }
    return { plan, progress, done, total, todayIndex };
  }

  async function create(
    label: string,
    sessions: Array<{ label?: string; items: PlaylistItem[] }>,
    description?: string
  ): Promise<ReadingPlan> {
    const id = `urn:seed:plan:${newOpId()}`;
    const doc: ReadingPlan = {
      "@id": id,
      "@type": "seed:ReadingPlan",
      publishedBy: identity()?.agent ?? LOCAL_AGENT,
      label,
      ...(description ? { description } : {}),
      hasSession: sessions.map((s, i) => ({
        "@type": "seed:PlanSession",
        "@id": `${id}:s${i + 1}`,
        ...(s.label ? { label: s.label } : {}),
        readings: s.items.map((item, j) => ({
          "@type": "seed:PlanReading",
          "@id": `${id}:s${i + 1}:r${j + 1}`,
          item,
        })),
      })),
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
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await works.save(doc);
    return doc;
  }

  /** A plan from a run of chapters, N chapters a session. */
  async function createFromChapters(
    label: string,
    translationId: string,
    bookId: string,
    fromChapter: number,
    toChapter: number,
    perSession = 1
  ) {
    const sessions: Array<{ label?: string; items: PlaylistItem[] }> = [];
    for (let c = fromChapter; c <= toChapter; c += perSession) {
      const items: PlaylistItem[] = [];
      for (let k = c; k < c + perSession && k <= toChapter; k++)
        items.push({
          "@type": "seed:ScriptureItem",
          aboutPassage: `${bookId}.${k}`,
          ofEdition: translationId,
        });
      sessions.push({ items });
    }
    return create(label, sessions);
  }

  async function start(planId: string, cadenceId?: string) {
    const plan = works.byId(planId);
    if (!plan) throw new Error("no such plan");
    const cadence =
      cadenceId ?? plan.defaultCadence ?? plan.cadenceOptions[0]!["@id"];
    const existing = progressOf(planId);
    const item: PlanProgress = {
      "@id":
        existing?.["@id"] ?? `urn:seed:progress:${planId.split(":").pop()}`,
      "@type": "seed:PlanProgress",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      aboutPassage: firstChapter(plan) ?? "GEN.1",
      progressOf: planId,
      selectedCadence: cadence,
      selfPaced:
        plan.cadenceOptions.find((c) => c["@id"] === cadence)
          ?.daysPerSession === 0,
      startedAt: nowIso(),
      sessions: [],
      opId: newOpId(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await buckets.put("progress", undefined, item);
  }

  async function setDone(
    planId: string,
    sessionId: string,
    readingId: string,
    done: boolean
  ) {
    const progress = progressOf(planId);
    if (!progress) return;
    const plan = works.byId(planId);
    const session = plan?.hasSession.find((s) => s["@id"] === sessionId);
    const sessions = [...progress.sessions];
    const i = sessions.findIndex((s) => s.session === sessionId);
    const cur =
      i >= 0
        ? sessions[i]!
        : {
            "@type": "seed:SessionProgress" as const,
            session: sessionId,
            completed: [] as string[],
          };
    const completed = done
      ? [...new Set([...cur.completed, readingId])]
      : cur.completed.filter((r) => r !== readingId);
    const all = !!session && completed.length >= session.readings.length;
    const nextSession = {
      ...cur,
      completed,
      ...(all ? { completedAt: nowIso() } : {}),
    };
    if (!all) delete (nextSession as { completedAt?: string }).completedAt;
    if (i >= 0) sessions[i] = nextSession;
    else sessions.push(nextSession);
    await buckets.put("progress", undefined, {
      ...progress,
      sessions,
      opId: newOpId(),
      updatedAt: nowIso(),
    });
  }

  /** A whole session (a day) marked read: all its readings at once. */
  async function completeSession(planId: string, sessionId: string) {
    const progress = progressOf(planId);
    const session = works
      .byId(planId)
      ?.hasSession.find((s) => s["@id"] === sessionId);
    if (!progress || !session) return;
    const sessions = progress.sessions.filter((s) => s.session !== sessionId);
    sessions.push({
      "@type": "seed:SessionProgress",
      session: sessionId,
      completed: session.readings.map((r) => r["@id"]),
      completedAt: nowIso(),
    });
    await buckets.put("progress", undefined, {
      ...progress,
      sessions,
      opId: newOpId(),
      updatedAt: nowIso(),
    });
  }

  async function update(
    planId: string,
    patch: Partial<Pick<ReadingPlan, "heroImage">>
  ) {
    const plan = works.byId(planId);
    if (!plan) throw new Error("no such plan");
    const next: ReadingPlan = { ...plan, ...patch };
    if (!next.heroImage) delete next.heroImage;
    await works.save(next);
  }

  async function reset(planId: string) {
    const progress = progressOf(planId);
    if (progress)
      await buckets.put("progress", undefined, {
        ...progress,
        deleted: true,
        opId: newOpId(),
        updatedAt: nowIso(),
      });
  }

  return {
    ...works,
    views,
    view,
    progressOf,
    create,
    createFromChapters,
    start,
    setDone,
    completeSession,
    update,
    reset,
  };
}

export type Plans = ReturnType<typeof createPlans>;

export function firstChapter(plan: ReadingPlan): string | null {
  for (const s of plan.hasSession)
    for (const r of s.readings)
      if (r.item["@type"] === "seed:ScriptureItem") return r.item.aboutPassage;
  return null;
}
