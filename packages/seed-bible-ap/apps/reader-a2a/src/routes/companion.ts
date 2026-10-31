// THE STUDY COMPANION, ASKED OF THE SCRIPTURE AGENT (skills docs/bible-translation/verse-companion-spec.md §6). A signed-in reader's question
// about the verse they have open goes to scripture-resolver.svc as its `ask-verse` skill — the standard A2A streaming method with a data part
// {skill: 'ask-verse', args}, over the same binding every /bible/api/* read already uses — and the agent's events are piped to the pane as
// they come (`who`, `dossier`, `delta`, `check`, `done`). The serving plane's /companion, its shared secret and its llama model are out of
// the path: the answer comes from what the agent holds about the verse, cited, with what its check struck shown struck.
//
// `mode: 'writings'` is the slow path the agent offers by name (nextStep): the same question to its orchestrated ask over every writing it
// holds, answered whole in about a minute, run only when the reader presses for it.
import { locus as locusOf } from "../../../../lib/locus";
import type { BibleEnv } from "./bible";

const DEFAULT_ENDPOINT = "https://scripture.faithnet.io/api/a2a";
/** The editions the agent holds verse by verse (its D1 corpus); any other translation is answered from the BSB and says so. */
export const SERVED_EDITIONS = [
  "rbs",
  "bsb",
  "web",
  "kjv",
  "asv",
  "rbs-es-419",
  "rv1909",
  "blm",
];

export interface CompanionAsk {
  translationId?: string;
  bookId?: string;
  chapter?: number;
  verses?: number[];
  question?: string;
  history?: Array<{ role: string; text: string }>;
  role?: string;
  mode?: "verse" | "writings";
}

/** The edition and the OSIS reference the agent is asked about: the selection (≤ 5 verses), else the chapter's first verse. */
export function companionTarget(
  b: CompanionAsk
): { edition: string; editionNote: string | null; reference: string } | null {
  const ch = Number(b.chapter);
  const vs = (b.verses ?? [])
    .map(Number)
    .filter((n) => n > 0)
    .sort((x, y) => x - y);
  const first = vs[0] ?? 1;
  const last = Math.min(vs[vs.length - 1] ?? first, first + 4);
  const l = b.bookId && ch > 0 ? locusOf(b.bookId, ch, first) : null;
  if (!l) return null;
  const t = String(b.translationId ?? "").toLowerCase();
  const edition = SERVED_EDITIONS.includes(t) ? t : "bsb";
  return {
    edition,
    editionNote:
      edition === t
        ? null
        : `the agent holds ${b.translationId} verse by verse only as BSB`,
    reference:
      last > first
        ? `${l.osis}.${ch}.${first}-${last}`
        : `${l.osis}.${ch}.${first}`,
  };
}

export async function askCompanion(
  env: BibleEnv,
  b: CompanionAsk
): Promise<Response> {
  const target = companionTarget(b);
  const question = String(b.question ?? "")
    .trim()
    .slice(0, 2000);
  if (!target || !question)
    return Response.json(
      { ok: false, error: "a question and the verse it is about are required" },
      { status: 400 }
    );
  const history = (b.history ?? [])
    .slice(-6)
    .map((h) => ({
      role: h.role === "assistant" ? "agent" : "user",
      text: String(h.text ?? "").slice(0, 1500),
    }));
  const fetcher = env.SCRIPTURE
    ? (input: RequestInfo | URL, init?: RequestInit) =>
        env.SCRIPTURE!.fetch(input, init)
    : fetch;
  const endpoint = env.SCRIPTURE_A2A_URL ?? DEFAULT_ENDPOINT;
  const streaming = b.mode !== "writings";
  const parts = streaming
    ? [
        {
          data: {
            skill: "ask-verse",
            args: {
              edition: target.edition,
              reference: target.reference,
              question,
              history,
              ...(b.role ? { role: b.role } : {}),
            },
          },
          mediaType: "application/json",
        },
      ]
    : [
        { text: `${question} (About ${target.reference}.)` },
        {
          data: {
            context: { role: b.role ?? "growing", history },
            edition: target.edition,
            mode: "writings",
          },
          mediaType: "application/json",
        },
      ];
  const res = await fetcher(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "A2A-Version": "1.0" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: streaming ? "SendStreamingMessage" : "SendMessage",
      params: {
        message: { messageId: crypto.randomUUID(), role: "ROLE_USER", parts },
      },
    }),
  });
  if (!res.ok || !res.body)
    return Response.json(
      { ok: false, error: `the scripture agent answered ${res.status}` },
      { status: 502 }
    );
  if (!streaming) {
    const j = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      result?: {
        message?: {
          parts?: Array<{ text?: string; data?: Record<string, unknown> }>;
        };
      };
    } | null;
    if (!j || j.error)
      return Response.json(
        {
          ok: false,
          error: j?.error?.message ?? "the scripture agent did not answer",
        },
        { status: 502 }
      );
    const d = j.result?.message?.parts?.find((p) => p.data)?.data ?? {};
    return Response.json({
      ok: true,
      ...target,
      answer:
        d.answer ?? j.result?.message?.parts?.find((p) => p.text)?.text ?? "",
      agent: d.agent ?? null,
      evidence: d.evidence ?? [],
    });
  }
  // the agent's events, piped as they come; the pane reads the JSON-RPC result's data part
  return new Response(res.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-sb-edition": target.edition,
      "x-sb-reference": target.reference,
      ...(target.editionNote
        ? { "x-sb-edition-note": target.editionNote }
        : {}),
    },
  });
}
