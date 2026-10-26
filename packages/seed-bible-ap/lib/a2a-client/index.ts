// A MINIMAL A2A CLIENT over fetch — what a stranger sends an agent on the estate: one standard `SendMessage` with a
// data part, one message back. The public-shelf lane (spec 412) is the first use: `library.public.list` /
// `library.public.read` at an owner's card interface (`https://edge.faithnet.io/api/a2a/<name>`), no credential,
// no task. Pure over an injected fetch so the crawl is tested with a fake one.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class A2aError extends Error {
  constructor(
    message: string,
    readonly code?: number
  ) {
    super(message);
    this.name = "A2aError";
  }
}

export interface A2aReply {
  messageId?: string;
  role?: string;
  parts?: Array<{ text?: string; data?: Record<string, unknown> }>;
}

let rpcId = 0;

/** One `SendMessage` carrying a data part; the reply message's data part, or a thrown A2aError. */
export async function sendData(
  fetchImpl: Fetch,
  endpoint: string,
  data: Record<string, unknown>,
  timeoutMs = 20_000
): Promise<Record<string, unknown>> {
  const id = ++rpcId;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "a2a-version": "1.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "SendMessage",
        params: {
          message: {
            messageId: `m-${id}-${Date.now().toString(36)}`,
            role: "ROLE_USER",
            parts: [{ data }],
          },
        },
      }),
      signal: ctl.signal,
    });
  } catch (e) {
    throw new A2aError(
      `${String(data.skill ?? "message")}: unreachable (${e instanceof Error ? e.message : String(e)})`
    );
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as {
    result?: A2aReply;
    error?: { code?: number; message?: string };
  } | null;
  if (body?.error)
    throw new A2aError(
      `${String(data.skill ?? "message")}: ${body.error.message ?? "error"}`,
      body.error.code
    );
  if (!res.ok || !body?.result)
    throw new A2aError(
      `${String(data.skill ?? "message")}: HTTP ${res.status}`,
      res.status
    );
  const part = (body.result.parts ?? []).find(
    (p) => p.data && typeof p.data === "object"
  );
  if (!part?.data)
    throw new A2aError(
      `${String(data.skill ?? "message")}: the reply carried no data part`
    );
  return part.data;
}

/** One entry of a public shelf as `library.public.list` reports it (ap-home library-tools.ts `shelfView`). */
export interface ShelfEntry {
  id: string;
  name: string;
  folder?: string;
  path?: string;
  kind?: string;
  size?: number;
  version?: number;
  isFolder?: boolean;
  contentType?: string;
  commitment?: string;
  /** The latest signed release, when the owner minted one. */
  release?: {
    version?: string;
    releaseId?: string;
    signed?: boolean;
    publishedAt?: number;
    canonicalId?: string;
  };
}

export interface ShelfListing {
  owner: string;
  count: number;
  files: ShelfEntry[];
  truncated: boolean;
}

export async function publicShelfList(
  fetchImpl: Fetch,
  endpoint: string,
  folder: string,
  max = 200
): Promise<ShelfListing> {
  const d = await sendData(fetchImpl, endpoint, {
    skill: "library.public.list",
    folder,
    max,
  });
  return {
    owner: String(d.owner ?? "").toLowerCase(),
    count: Number(d.count ?? 0),
    files: Array.isArray(d.files) ? (d.files as ShelfEntry[]) : [],
    truncated: d.truncated === true,
  };
}

export interface ShelfRead {
  read: boolean;
  owner: string;
  text?: string;
  truncated?: boolean;
  file?: ShelfEntry;
  refused?: string;
  /** An image's bytes, when the document is one. */
  bytesB64?: string;
  contentType?: string;
}

export async function publicShelfRead(
  fetchImpl: Fetch,
  endpoint: string,
  ref: { id?: string; name?: string; folder?: string }
): Promise<ShelfRead> {
  const d = await sendData(fetchImpl, endpoint, {
    skill: "library.public.read",
    ...ref,
  });
  return {
    read: d.read === true,
    owner: String(d.owner ?? "").toLowerCase(),
    ...(typeof d.text === "string" ? { text: d.text } : {}),
    ...(typeof d.bytesB64 === "string" ? { bytesB64: d.bytesB64 } : {}),
    ...(typeof d.contentType === "string"
      ? { contentType: d.contentType }
      : {}),
    ...(d.truncated === true ? { truncated: true } : {}),
    ...(d.file ? { file: d.file as ShelfEntry } : {}),
    ...(typeof d.refused === "string" ? { refused: d.refused } : {}),
  };
}

/** The estate's public door for a named agent (its card's `supportedInterfaces[0].url`). */
export const edgeEndpointFor = (
  name: string,
  edge = "https://edge.faithnet.io"
) => `${edge.replace(/\/$/, "")}/api/a2a/${name}`;
