// The dev backend's stand-in for the reader's agent's person.faith.* tools: the same answers, kept in memory, so the
// Faith page runs and is tested without a network. The real rules (shapes, who may see what) live in the agent.
import type {
  CareRequest,
  Church,
  FaithBackend,
  JourneyView,
  Milestone,
  Prayer,
  Stage,
} from "../state/faith/faith";

const STAGE_LABEL: Record<Stage, string> = {
  Seeker: "Seeker",
  GospelClarity: "Understanding the gospel",
  Conversion: "Deciding to follow Jesus",
  NewBeliever: "New believer",
  Connected: "Connected",
  Growing: "Growing disciple",
  Serving: "Serving",
  Multiplying: "Multiplying",
  Leader: "Leader",
};
const MILESTONE_LABEL: Record<Milestone, string> = {
  UnderstoodGospel: "Understood the gospel",
  ProfessionOfFaith: "Professed faith in Jesus",
  Baptized: "Baptized",
  JoinedGroup: "Joined a group",
  FoundationsClass: "Took a foundations class",
  StartedServing: "Started serving",
  SharedTestimony: "Shared their story",
};
/** faith.data.ttl's next-step graph, as the agent applies it. */
const NEXT: Record<Stage, { next?: Stage; requires: string[] }> = {
  Seeker: { next: "GospelClarity", requires: [] },
  GospelClarity: {
    next: "Conversion",
    requires: ["milestone:UnderstoodGospel"],
  },
  Conversion: {
    next: "NewBeliever",
    requires: ["milestone:ProfessionOfFaith"],
  },
  NewBeliever: {
    next: "Connected",
    requires: ["practice:Bible", "practice:Prayer"],
  },
  Connected: { next: "Growing", requires: ["milestone:JoinedGroup"] },
  Growing: { next: "Serving", requires: ["milestone:FoundationsClass"] },
  Serving: { next: "Multiplying", requires: ["milestone:StartedServing"] },
  Multiplying: { next: "Leader", requires: [] },
  Leader: { requires: [] },
};
const PRACTICE_LABEL: Record<string, string> = {
  Bible: "Reading the Bible",
  Prayer: "Prayer",
};

export interface DevFaith extends FaithBackend {
  /** The churches the fake Home says the reader belongs to. */
  churchList: Church[];
}

export function createDevFaith(guard: () => void): DevFaith {
  const stages: Array<{ stage: Stage; assertedAt: string }> = [];
  const milestones: JourneyView["milestones"] = [];
  const prayers: Prayer[] = [];
  const care: CareRequest[] = [];
  let n = 0;
  const id = () => `dev-${Date.now().toString(36)}-${(n++).toString(36)}`;
  const now = () => new Date().toISOString();
  return {
    churchList: [],
    async faithJourney() {
      guard();
      const current = [...stages].sort((a, b) =>
        b.assertedAt.localeCompare(a.assertedAt)
      )[0];
      const have = milestones.map((m) => m.milestone);
      const steps: JourneyView["nextSteps"] = [];
      if (current) {
        const add = (refs: string[], forStage: Stage) => {
          for (const r of refs) {
            const [kind, value] = r.split(":") as [
              "milestone" | "practice",
              string,
            ];
            if (kind === "milestone" && have.includes(value as Milestone))
              continue;
            steps.push({
              kind,
              value,
              label:
                kind === "milestone"
                  ? MILESTONE_LABEL[value as Milestone]
                  : (PRACTICE_LABEL[value] ?? value),
              strength: "requires",
              forStage,
            });
          }
        };
        add(NEXT[current.stage].requires, current.stage);
        const next = NEXT[current.stage].next;
        if (next) add(NEXT[next].requires, next);
      }
      return {
        stage: current
          ? {
              ...current,
              label: STAGE_LABEL[current.stage],
              visibility: "Confidential",
            }
          : null,
        history: [...stages].reverse(),
        milestones: [...milestones],
        nextSteps: steps,
      };
    },
    async faithRecordJourney(args) {
      guard();
      if (args.remove) {
        const i = milestones.findIndex((m) => m.id === args.remove);
        if (i >= 0) milestones.splice(i, 1);
        return { answer: "Removed." };
      }
      if (args.stage) stages.push({ stage: args.stage, assertedAt: now() });
      if (args.milestone)
        milestones.push({
          id: id(),
          milestone: args.milestone,
          label: MILESTONE_LABEL[args.milestone],
          ...(args.occurredOn ? { occurredOn: args.occurredOn } : {}),
          ...(args.place ? { place: args.place } : {}),
          ...(args.note ? { note: args.note } : {}),
          visibility: args.visibility ?? "Confidential",
        });
      return { answer: "Kept; only you can see it." };
    },
    async faithPrayers() {
      guard();
      return {
        prayers: [...prayers].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        ),
        care: [...care],
      };
    },
    async faithSavePrayer(args) {
      guard();
      const at = now();
      const cur = args.id ? prayers.find((p) => p.id === args.id) : undefined;
      if (args.remove && cur) {
        prayers.splice(prayers.indexOf(cur), 1);
        return { answer: "Removed from your prayers." };
      }
      const p: Prayer = cur ?? {
        id: id(),
        label: args.label ?? "",
        kind: args.kind ?? "Request",
        status: "expressed",
        visibility: args.visibility ?? "Confidential",
        prayedCount: 0,
        createdAt: at,
      };
      if (!cur) prayers.push(p);
      if (args.label) p.label = args.label;
      if (args.description !== undefined) p.description = args.description;
      if (args.prayingFor !== undefined) p.prayingFor = args.prayingFor;
      if (args.kind) p.kind = args.kind;
      if (args.visibility) p.visibility = args.visibility;
      if (args.sharedWith) p.sharedWith = args.sharedWith;
      if (args.status) p.status = args.status;
      if (args.prayed) {
        p.prayedCount += 1;
        p.lastPrayedAt = at;
      }
      if (args.answered) {
        p.status = "fulfilled";
        p.answered = { description: args.answered, answeredAt: at };
      }
      return {
        answer: args.answered
          ? "Answered — kept with your words."
          : args.prayed
            ? `Prayed (${p.prayedCount})`
            : cur
              ? "Updated."
              : "Added to your prayers.",
      };
    },
    async faithRequestCare(args) {
      guard();
      const cur = args.id ? care.find((c) => c.id === args.id) : undefined;
      if (args.withdraw && cur) {
        cur.status = "withdrawn";
        return { answer: "Withdrawn." };
      }
      care.push({
        id: id(),
        label: args.label ?? "",
        ...(args.description ? { description: args.description } : {}),
        urgency: args.urgency ?? "Normal",
        status: "expressed",
        ...(args.church ? { sharedWith: [args.church] } : {}),
        ...(args.safeToText !== undefined
          ? { safeToText: args.safeToText }
          : {}),
        createdAt: now(),
      });
      return {
        answer: args.church
          ? "Kept — the leaders of the church you named can see it."
          : "Kept — name your church so its leaders can see it.",
      };
    },
    async faithChurches() {
      guard();
      return [...this.churchList];
    },
  };
}
