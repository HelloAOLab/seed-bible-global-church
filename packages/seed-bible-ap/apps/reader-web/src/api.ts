// The reader agent, reached through this page's `/a2a` proxy (dev) or the deployed agent origin (VITE_A2A_BASE).
// Browser code never reaches reader-mcp directly (ADR-0044): the agent does.

export const A2A_BASE = (
  (import.meta.env["VITE_A2A_BASE"] as string | undefined) ?? "/a2a"
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
