// The dev backend's stand-in for the reader's agent's person.faith.* tools: the same answers, kept in memory, so the
// Faith page runs and is tested without a network. The real rules (shapes, who may see what) live in the agent.
import type {
  CareRequest,
  Church,
  ChurchDescription,
  ChurchHome,
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
  /** The churches the fake naming service lists, each with what it says of itself. */
  churchesOnFaithNet: ChurchDescription[];
}

export function createDevFaith(guard: () => void): DevFaith {
  const stages: Array<{ stage: Stage; assertedAt: string }> = [];
  const milestones: JourneyView["milestones"] = [];
  const prayers: Prayer[] = [];
  const care: CareRequest[] = [];
  let home: ChurchHome = { churches: [], defaultChurch: null, groups: [] };
  let n = 0;
  const id = () => `dev-${Date.now().toString(36)}-${(n++).toString(36)}`;
  const now = () => new Date().toISOString();
  return {
    churchList: [],
    churchesOnFaithNet: [],
    async churchDirectory() {
      guard();
      return this.churchesOnFaithNet.map((d) => ({
        agent: d.church.agent,
        name: d.church.name,
        displayName: d.church.displayName,
        describable: true,
      }));
    },
    async describeChurch(name) {
      guard();
      const d = this.churchesOnFaithNet.find((c) => c.church.name === name);
      if (!d) throw new Error(`${name} is not a church on FaithNet`);
      return d;
    },
    async faithChurchHome() {
      guard();
      return {
        ...home,
        churches: [...home.churches],
        groups: [...home.groups],
      };
    },
    async faithSaveChurchHome(args) {
      guard();
      // The agent's rule (spec 203 §3): the church must say the site is one of its own.
      const churches: ChurchHome["churches"] = [];
      for (const c of args.churches) {
        const d = this.churchesOnFaithNet.find(
          (x) => x.church.agent === c.agent
        );
        if (!d) throw new Error(`${c.name} is not a church on FaithNet`);
        const site = c.site ? d.sites.find((s) => s.id === c.site) : null;
        if (c.site && !site)
          throw new Error(`${d.church.displayName} has no site ${c.site}`);
        churches.push({
          agent: c.agent,
          name: d.church.name,
          displayName: d.church.displayName,
          site: site ? { id: site.id, name: site.name } : null,
        });
      }
      // The agent's rule for groups (spec 204 §2): left out, the stored ones stay unless their church was dropped; a
      // church's group must be one that church lists, and takes the church's own name for it.
      let groups: ChurchHome["groups"];
      if (!args.groups)
        groups = home.groups.filter(
          (g) => g.church === null || churches.some((c) => c.agent === g.church)
        );
      else {
        groups = [];
        for (const g of args.groups) {
          if ("church" in g) {
            const d = this.churchesOnFaithNet.find(
              (x) => x.church.agent === g.church
            );
            if (!d || !churches.some((c) => c.agent === g.church))
              throw new Error("choose that church first, then its group");
            // A group already kept stays when its church stops listing it.
            const hit =
              d.groups?.find((x) => x.id === g.id) ??
              home.groups.find((x) => x.church === g.church && x.id === g.id);
            if (!hit)
              throw new Error(
                `${d.church.displayName} does not list a group "${g.id}"`
              );
            // Left unsaid, what the reader told the leaders stays (spec 205 §2).
            const held = home.groups.find(
              (x) => x.church === g.church && x.id === g.id
            )?.shared;
            const shared =
              g.shared === undefined ? held : g.shared || undefined;
            groups.push({
              id: hit.id,
              name: hit.name,
              kind: hit.kind,
              church: g.church,
              ...(shared ? { shared } : {}),
            });
          } else {
            if (!g.name.trim())
              throw new Error("a group of your own needs a name");
            groups.push({
              id:
                g.id ??
                `own-${g.name
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")}`,
              name: g.name.trim(),
              kind: g.kind,
              church: null,
            });
          }
        }
      }
      home = { churches, defaultChurch: args.defaultChurch, groups };
      return { answer: "Kept — your church and site are saved." };
    },
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
