// THE CHURCH DIRECTORY — ap-church spec 203. FaithNet's churches are the `.church` names (the naming service), and a
// church says who it is and where it meets in its own `church.describe` answer, to anyone, no credential. This
// workspace only reads both; the reader's choice is kept by their own agent (person.church.home.*, skills/faith.ts).
import type { ToolSpec, ToolInvoker } from "@agenticprimitives/orchestration";
import { WireRefusal } from "../wires";

export interface ChurchEnv {
  /** The naming service (default https://names.faithnet.io). */
  NAMES_URL?: string;
}

export interface DirectoryChurch {
  agent: string;
  name: string;
  displayName: string;
  description?: string;
  /** Whether the church can be asked for its sites (it has an A2A endpoint). */
  describable: boolean;
}

export interface ChurchSite {
  id: string;
  name: string;
  address?: Record<string, string>;
  timezone?: string;
  website?: string;
  services?: Array<{ day: string; time: string; durationMinutes?: number }>;
}

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

type NameView = {
  status?: string;
  name?: string;
  agent?: string;
  displayName?: string;
  declared?: { agentType?: string };
  typeCheck?: { ok?: boolean };
  records?: Array<{ key: string; value: string }>;
};

const namesOf = (env: ChurchEnv) =>
  (env.NAMES_URL ?? "https://names.faithnet.io").replace(/\/$/, "");
const getJson = async <T>(f: typeof fetch, url: string): Promise<T> => {
  const r = await f(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return (await r.json()) as T;
};
const record = (v: NameView, key: string) =>
  v.records?.find((r) => r.key === key)?.value;
const isChurch = (v: NameView) =>
  v.status === "registered" &&
  v.declared?.agentType === "church" &&
  v.typeCheck?.ok === true &&
  !!v.agent;

// One list per isolate for a few minutes: the directory changes when a church buys a name, not per request.
let cached: { at: number; list: DirectoryChurch[] } | null = null;
const TTL_MS = 5 * 60_000;
export const clearDirectoryCache = () => {
  cached = null;
};

export async function churchDirectory(
  env: ChurchEnv,
  f: typeof fetch = fetch,
  now = Date.now()
): Promise<DirectoryChurch[]> {
  if (cached && now - cached.at < TTL_MS) return cached.list;
  const base = namesOf(env);
  const names: string[] = [];
  for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
    const r = await getJson<{
      pages?: number;
      names?: Array<{ name: string }>;
    }>(f, `${base}/api/root/church?page=${page}`);
    pages = r.pages ?? 1;
    names.push(...(r.names ?? []).map((n) => n.name));
  }
  const views = await Promise.all(
    names.map((n) =>
      getJson<NameView>(f, `${base}/api/name/${encodeURIComponent(n)}`).catch(
        () => null
      )
    )
  );
  const list = views
    .filter((v): v is NameView => !!v && isChurch(v))
    .map((v) => {
      const description = record(v, "description");
      return {
        agent: v.agent!.toLowerCase(),
        name: v.name!,
        displayName: record(v, "displayName") ?? v.displayName ?? v.name!,
        ...(description ? { description } : {}),
        describable: !!record(v, "a2aEndpoint"),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  cached = { at: now, list };
  return list;
}

/** The church's JSON-RPC endpoint: its card's interface (spec 203 §2), else the name's a2aEndpoint record. */
async function endpointOf(f: typeof fetch, v: NameView): Promise<string> {
  const a2a = record(v, "a2aEndpoint");
  const cardUri =
    record(v, "cardUri") ??
    (a2a ? `${new URL(a2a).origin}/.well-known/agent-card.json` : null);
  if (cardUri) {
    const card = await getJson<{
      supportedInterfaces?: Array<{ protocolBinding?: string; url?: string }>;
    }>(f, cardUri).catch(() => null);
    const url = card?.supportedInterfaces?.find(
      (i) => i.protocolBinding === "JSONRPC" && i.url
    )?.url;
    if (url) return url;
  }
  if (!a2a) throw new WireRefusal(404, `${v.name} has no A2A endpoint to ask`);
  return a2a;
}

export async function describeChurch(
  env: ChurchEnv,
  name: string,
  f: typeof fetch = fetch
): Promise<ChurchDescription> {
  const n = name.trim().toLowerCase();
  if (!/^[a-z0-9-]+\.church$/.test(n))
    throw new WireRefusal(400, "say a .church name");
  const v = await getJson<NameView>(
    f,
    `${namesOf(env)}/api/name/${encodeURIComponent(n)}`
  );
  if (!isChurch(v))
    throw new WireRefusal(404, `${n} is not a church on FaithNet`);
  const agent = v.agent!.toLowerCase();
  const url = await endpointOf(f, v);
  const r = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json", "A2A-Version": "1.0" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: {
        message: {
          messageId: crypto.randomUUID(),
          role: "ROLE_USER",
          parts: [{ data: { skill: "church.describe" } }],
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await r.json().catch(() => ({}))) as {
    result?: { parts?: Array<{ data?: Record<string, unknown> }> };
    error?: { message?: string };
  };
  const data = body.result?.parts?.find(
    (p) => p.data?.skill === "church.describe"
  )?.data as Partial<ChurchDescription> | undefined;
  if (!data?.church)
    throw new WireRefusal(
      502,
      `${v.displayName ?? n} did not describe itself${body.error?.message ? ` (${body.error.message})` : ""}`
    );
  // A church speaks for itself only: an answer naming another agent is not this church's.
  if (String(data.church.agent ?? "").toLowerCase() !== agent)
    throw new WireRefusal(502, `${n} answered for another agent`);
  const sites = (Array.isArray(data.sites) ? data.sites : []).filter(
    (s): s is ChurchSite =>
      !!s && typeof s.id === "string" && typeof s.name === "string"
  );
  return {
    church: { ...data.church, agent, name: n },
    sites,
  };
}

export const CHURCH_TOOLS: ToolSpec[] = [
  {
    id: "seed.church.directory",
    description:
      "FaithNet's churches: every .church name on the naming service, with its display name (ap-church spec 203). No args.",
    inputSchema: { type: "object", properties: {} },
    answers: ["which churches are on FaithNet"],
    establishes: "lookup",
  },
  {
    id: "seed.church.describe",
    description:
      "A church's own description and its sites (address, time zone, service times), asked of the church's agent with church.describe (ap-church spec 203). Args: name (the .church name).",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
    },
    answers: ["where does my church meet"],
    establishes: "lookup",
  },
];

export function churchInvokers(
  env: ChurchEnv,
  f: typeof fetch = fetch
): Record<string, ToolInvoker> {
  return {
    "seed.church.directory": async () => ({
      churches: await churchDirectory(env, f),
    }),
    "seed.church.describe": async (_t, args) =>
      describeChurch(env, String(args.name ?? ""), f),
  };
}
