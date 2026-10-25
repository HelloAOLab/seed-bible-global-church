// The reader agent, reached through this page's `/a2a` proxy (dev) or the deployed agent origin (VITE_A2A_BASE).
// Browser code never reaches reader-mcp directly (ADR-0044): the agent does.

const viteEnv = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env;
export const A2A_BASE = (
  viteEnv?.["VITE_A2A_BASE"] ??
  (typeof process !== "undefined" ? process.env["A2A_BASE"] : undefined) ??
  "/a2a"
).replace(/\/$/, "");

export interface HelloResult {
  ok: boolean;
  greeting?: string;
  workspace?: string;
  reader?: { agent: string; name: string; estate: string; via: string } | null;
  error?: string;
}

export async function sayHello(
  token: string | null,
  name?: string
): Promise<HelloResult> {
  const res = await fetch(`${A2A_BASE}/hello`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(token ? { id_token: token } : {}),
      ...(name ? { name } : {}),
    }),
  });
  return res.json() as Promise<HelloResult>;
}

/** The accountable lane: one harness run on the agent's own object, as the signed-in reader. */
export interface AskResult {
  ok: boolean;
  runRef?: string;
  reply?: {
    kind: string;
    text?: string;
    error?: string;
    results?: Array<{ toolId: string; result: unknown }>;
  };
  error?: string;
}

export async function askAgent(
  token: string,
  message: string
): Promise<AskResult> {
  const res = await fetch(`${A2A_BASE}/harness/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: token, message }),
  });
  return res.json() as Promise<AskResult>;
}

export interface DevReader {
  handle: string;
  name: string;
  sa: string;
}

export async function listDevReaders(): Promise<DevReader[]> {
  try {
    const res = await fetch(`${A2A_BASE}/dev/readers`);
    const out = (await res.json()) as { readers?: DevReader[] };
    return out.readers ?? [];
  } catch {
    return [];
  }
}

/** Hand the reader's ask-as-me wire to reader-a2a, which keeps it per person (only after their Home verified them). */
export async function connectWire(
  token: string,
  delegation: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${A2A_BASE}/api/connect`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ delegation }),
  }).catch(() => null);
  if (!res)
    return { ok: false, error: "the reader workspace could not be reached" };
  return (await res
    .json()
    .catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as {
    ok: boolean;
    error?: string;
  };
}

/** Hand reader-a2a the reader's act-as-me standing wires (adding and removing a friend without the Home's window). */
export async function connectActWires(
  token: string,
  delegations: Record<string, unknown>[]
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${A2A_BASE}/api/connect/act`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ delegations }),
  }).catch(() => null);
  if (!res)
    return { ok: false, error: "the reader workspace could not be reached" };
  return (await res
    .json()
    .catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as {
    ok: boolean;
    error?: string;
  };
}

/** Who the workspace says you are, verified against your Home, and whether it holds your wire. */
export async function whoAmI(token: string): Promise<{
  ok: boolean;
  reader?: { agent: string; name: string; via: string };
  wire?: boolean;
  error?: string;
}> {
  const res = await fetch(`${A2A_BASE}/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return res.json() as Promise<{
    ok: boolean;
    reader?: { agent: string; name: string; via: string };
    wire?: boolean;
    error?: string;
  }>;
}
