// LIVE SESSIONS, THE ACTS — `seed.session.start` (the host opens a room and the host's agent keeps the
// `seed:ReadingSession` record in their Library), `seed.session.join` (standing = the host, or the share code the
// host handed out; a stranger gets 404), `seed.session.record` (the record, read back). Each join mints a ONE-TIME
// token the device presents on its WebSocket; the room consumes it (rooms/ReadingSession.ts).
import type { ToolSpec } from "@agenticprimitives/orchestration";
import { SEED_CONTEXT } from "../../../../lib/seed-schema";
import {
  readStep,
  saveJsonLdStep,
  type LibraryRead,
  type LibrarySaved,
} from "../../../../lib/library-client";
import { WireRefusal } from "../wires";
import { agentFor, type VaultEnv } from "./vault";

export interface RoomsEnv {
  ReadingSession?: DurableObjectNamespace;
  A2A_INTERNAL_MARKER?: string;
}

export const SESSION_START: ToolSpec = {
  id: "seed.session.start",
  description:
    "Opens a live reading session hosted by the signed-in reader at a passage: the room on this workspace, a share code for friends, and the seed:ReadingSession record in the host's Library. Args: translationId, bookId, chapterNumber.",
  inputSchema: {
    type: "object",
    properties: {
      translationId: { type: "string" },
      bookId: { type: "string" },
      chapterNumber: { type: "number" },
    },
    required: ["translationId", "bookId", "chapterNumber"],
  },
  answers: ["start a reading session", "read John 3 together"],
};

export const SESSION_JOIN: ToolSpec = {
  id: "seed.session.join",
  description:
    "Joins a live reading session: the host, or anyone with the session's share code, gets a one-time token for the room. Args: sessionId, code (the share code; the host needs none).",
  inputSchema: {
    type: "object",
    properties: { sessionId: { type: "string" }, code: { type: "string" } },
    required: ["sessionId"],
  },
  answers: ["join the reading session", "join with this code"],
};

export const SESSION_RECORD: ToolSpec = {
  id: "seed.session.record",
  description:
    "The seed:ReadingSession record the signed-in reader's agent kept for a session they hosted. Args: sessionId.",
  inputSchema: {
    type: "object",
    properties: { sessionId: { type: "string" } },
    required: ["sessionId"],
  },
  answers: ["what sessions did I host"],
  establishes: "lookup",
};

const SESSIONS_FOLDER = "seed-bible/sessions";

async function room(
  env: RoomsEnv,
  id: string,
  path: string,
  init?: RequestInit
) {
  if (!env.ReadingSession)
    throw new WireRefusal(
      503,
      "live sessions are not configured on this workspace"
    );
  const stub = env.ReadingSession.get(env.ReadingSession.idFromName(id));
  const res = await stub.fetch(
    `https://room/agents/reading-session/${id}${path}`,
    {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-ap-internal": env.A2A_INTERNAL_MARKER ?? "",
        ...(init?.headers ?? {}),
      },
    }
  );
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok)
    throw new WireRefusal(
      res.status,
      String(out.error ?? `the room answered ${res.status}`)
    );
  return out;
}

const shortCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]
  ).join("");

export async function startSession(
  env: VaultEnv & RoomsEnv,
  reader: string,
  readerName: string,
  passage: { translationId: string; bookId: string; chapterNumber: number }
) {
  const id = crypto.randomUUID();
  const code = shortCode();
  const startedAt = new Date().toISOString();
  const osis = `${passage.bookId}.${passage.chapterNumber}`;
  // The record first (the room is a rebuild of it): the host's own agent keeps it, private, in their Library.
  let recordRef: string | null = null;
  let recordNote: string | undefined;
  try {
    const agent = await agentFor(env, reader);
    const doc = {
      "@context": SEED_CONTEXT,
      "@id": `urn:seed:session:${id}`,
      "@type": "seed:ReadingSession",
      label: `Reading ${osis} together`,
      host: reader,
      sessionOf: osis,
      ofEdition: passage.translationId,
      startedAt,
      room: `reading-session/${id}`,
    };
    const out = await agent.run<LibrarySaved>(
      [
        saveJsonLdStep(
          SESSIONS_FOLDER,
          `${id}.jsonld`,
          JSON.stringify(doc),
          undefined,
          "private"
        ),
      ],
      `keep the record of my reading session on ${osis}`
    );
    if (out.result.saved && out.result.file?.id)
      recordRef = `${SESSIONS_FOLDER}/${id}.jsonld`;
    else recordNote = out.result.refused ?? "the record was not kept";
  } catch (e) {
    recordNote = e instanceof Error ? e.message : String(e);
  }
  await room(env, id, "/create", {
    method: "POST",
    body: JSON.stringify({
      id,
      host: { agent: reader, name: readerName },
      passage,
      recordRef,
      code,
    }),
  });
  const inv = await room(env, id, "/invite", {
    method: "POST",
    body: JSON.stringify({ agent: reader, name: readerName }),
  });
  return {
    sessionId: id,
    code,
    token: inv.token,
    role: inv.role,
    expiresInMs: inv.expiresInMs,
    recordRef,
    ...(recordNote ? { recordNote } : {}),
    text: `Session open on ${osis}. Share code ${code}.`,
  };
}

export async function joinSession(
  env: RoomsEnv,
  reader: string,
  readerName: string,
  sessionId: string,
  code: string | undefined
) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId))
    throw new WireRefusal(404, "no such session");
  const inv = await room(env, sessionId, "/invite", {
    method: "POST",
    body: JSON.stringify({
      agent: reader,
      name: readerName,
      ...(code ? { code: code.toUpperCase() } : {}),
    }),
  });
  return {
    sessionId,
    token: inv.token,
    role: inv.role,
    expiresInMs: inv.expiresInMs,
    text: `Joined session ${sessionId}.`,
  };
}

/** A guest's admission: the share code is the standing; the room mints a `guest:` identity for this session. */
export async function joinSessionAsGuest(
  env: RoomsEnv,
  sessionId: string,
  code: string,
  name: string
) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId))
    throw new WireRefusal(404, "no such session");
  const inv = await room(env, sessionId, "/invite", {
    method: "POST",
    body: JSON.stringify({ guest: true, name, code: code.toUpperCase() }),
  });
  return {
    sessionId,
    token: inv.token,
    role: inv.role,
    agent: inv.agent,
    name: inv.name,
    guest: true,
    expiresInMs: inv.expiresInMs,
    text: `Joined session ${sessionId} as a guest.`,
  };
}

export async function sessionRecord(
  env: VaultEnv,
  reader: string,
  sessionId: string
) {
  const agent = await agentFor(env, reader);
  const out = await agent.run<LibraryRead>(
    [readStep(SESSIONS_FOLDER, `${sessionId}.jsonld`)],
    `my record of session ${sessionId}`
  );
  if (!out.result.read)
    throw new WireRefusal(
      404,
      out.result.refused ?? "no record of that session"
    );
  let record: unknown = null;
  try {
    record = JSON.parse(out.result.text ?? "null");
  } catch {
    record = out.result.text ?? null;
  }
  return {
    sessionId,
    record,
    file: out.result.file ?? null,
    runRef: out.runRef,
  };
}

export const SESSION_TOOLS = [SESSION_START, SESSION_JOIN, SESSION_RECORD];
