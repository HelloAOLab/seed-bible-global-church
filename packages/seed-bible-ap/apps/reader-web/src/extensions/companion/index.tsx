// THE STUDY COMPANION — a question about the verse you have open, answered by the Scripture agent (scripture-resolver.svc) from what it
// holds about that verse: the verse in your translation, the story around it, its source words, the knowledge base, the edition's own
// notes and decisions, the scrolls and the Septuagint, and the writings placed on it — every claim cited, what its check refused shown
// struck through with the reason, and the agent, model and skill named under the answer. reader-a2a asks the agent's `ask-verse` skill
// over A2A and streams its events here (skills docs/bible-translation/verse-companion-spec.md). A question that reaches beyond the verse
// is not guessed at: the agent offers a search of every writing it holds, and that slower search runs only when you press for it.
import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import type { ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import { A2A_BASE } from "../../api";
import { useI18n } from "../../i18n";

export interface Cited {
  id: string;
  title: string;
  layer: string;
  kind: string;
  url?: string | null;
}
export interface Turn {
  role: "user" | "assistant";
  text: string;
  who?: string;
  cited?: Cited[];
  /** the dossier tag of each cited item, E1 → its id: how the prose's [E…] becomes a number */
  tags?: Record<string, string>;
  struck?: number;
  nextStep?: { label: string } | null;
  /** the verse's cross-references (OpenBible, strongest first), listed by code under the answer */
  crossRefs?: Array<{
    label: string;
    book?: string;
    chapter?: number;
    verse?: number;
  }>;
  /** follow-up questions the verse's evidence can answer */
  suggestions?: string[];
  question?: string;
  slow?: boolean;
}

const turns = signal<Turn[]>([]);
const streaming = signal(false);
const who = signal<string | null>(null);
const error = signal<string | null>(null);

/** One agent event: the data part of a JSON-RPC result on an SSE `data:` line (`who`, `dossier`, `delta`, `check`, `done`, `error`). */
export type AgentEvent = { event: string; [k: string]: unknown };
export function parseSse(
  chunk: string,
  onEvent: (e: AgentEvent) => void
): string {
  const blocks = chunk.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const j = JSON.parse(line.slice(5).trim()) as {
          result?: { message?: { parts?: Array<{ data?: AgentEvent }> } };
        };
        const d = j.result?.message?.parts?.find((p) => p.data)?.data;
        if (d?.event) onEvent(d);
      } catch {
        /* not JSON */
      }
    }
  }
  return rest;
}

const setLast = (patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
  const all = [...turns.value];
  const last = all[all.length - 1]!;
  all[all.length - 1] = {
    ...last,
    ...(typeof patch === "function" ? patch(last) : patch),
  };
  turns.value = all;
};

function target(state: ReaderState) {
  const sel = state.selection.verses.value;
  return {
    translationId: state.reading.translationId.value,
    bookId: state.reading.bookId.value,
    chapter: state.reading.chapterNumber.value,
    verses: sel.length ? sel : [1],
  };
}

export async function ask(
  state: ReaderState,
  question: string,
  opts: { slow?: boolean; signal?: AbortSignal } = {}
) {
  const s = state.session.value;
  if (!s) throw new Error("sign in to ask the companion");
  const history = turns.value
    .filter((t) => t.text)
    .slice(-6)
    .map((t) => ({ role: t.role, text: t.text }));
  turns.value = [
    ...turns.value,
    { role: "user", text: question },
    { role: "assistant", text: "", question, slow: !!opts.slow },
  ];
  streaming.value = true;
  error.value = null;
  try {
    const res = await fetch(`${A2A_BASE}/companion/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${s.token}`,
      },
      body: JSON.stringify({
        ...target(state),
        question,
        history,
        ...(opts.slow ? { mode: "writings" } : {}),
      }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(j?.error ?? `the companion answered ${res.status}`);
    }
    if (opts.slow) {
      const j = (await res.json()) as {
        answer?: string;
        agent?: { name?: string; model?: string } | null;
      };
      setLast({
        text: j.answer ?? "",
        who: j.agent
          ? `${j.agent.name} · ${j.agent.model} · ask-writings`
          : "ask-writings",
      });
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let rest = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rest = parseSse(rest + dec.decode(value, { stream: true }), (e) => {
        if (e.event === "who") {
          who.value = `${e.agent} · ${e.model} · ${String(e.skill ?? "").replace("skill:scripture/", "")}${e.skillSha256 ? ` @${String(e.skillSha256).slice(0, 8)}` : ""}`;
          setLast({ who: who.value });
        } else if (e.event === "delta")
          setLast((t) => ({ text: t.text + String(e.text ?? "") }));
        else if (e.event === "done") {
          // the checked answer replaces the streamed one: what the check struck is shown struck, with its reason
          setLast({
            text: String(e.answer ?? ""),
            cited: (e.cited as Cited[]) ?? [],
            tags: (e.citeTags as Record<string, string>) ?? {},
            struck: ((e.struck as unknown[]) ?? []).length,
            nextStep: (e.nextStep as { label: string } | undefined) ?? null,
            crossRefs: (e.crossReferences as Turn["crossRefs"]) ?? [],
            suggestions: (e.suggestions as string[]) ?? [],
          });
        } else if (e.event === "error")
          throw new Error(String(e.message ?? "the agent could not answer"));
      });
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    streaming.value = false;
  }
}

/** The answer's prose with each [E…] tag as a source number and each ~~struck~~ span struck through with its reason. */
export function renderAnswer(
  text: string,
  cited: Cited[] = [],
  tags: Record<string, string> = {}
) {
  const order = new Map(cited.map((c, i) => [c.id, i + 1]));
  const out: preact.ComponentChildren[] = [];
  text = text.replace(/\[(E\d+(?:\s*[,;]\s*E\d+)+)\]/g, (_m, l: string) =>
    l
      .split(/\s*[,;]\s*/)
      .map((t) => `[${t}]`)
      .join("")
  );
  const re = /~~([\s\S]+?)~~(?:\s*\*\(struck: ([^)]*)\)\*)?|\[(E\d+)\]/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push(text.slice(at, m.index));
    if (m[1] !== undefined)
      out.push(
        <del
          className="sb-companion-struck"
          title={m[2] ? `Struck by the check: ${m[2]}` : "Struck by the check"}
        >
          {m[1].replace(/\[E\d+\]/g, "")}
        </del>
      );
    else {
      const n = order.get(tags[m[3]!] ?? "");
      out.push(n ? <sup className="sb-companion-cite">{n}</sup> : null);
    }
    at = m.index! + m[0].length;
  }
  out.push(text.slice(at));
  return out;
}

function Pane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  return (
    <div className="sb-companion">
      <div className="sb-session-chat sb-companion-log">
        {turns.value.map((m, i) => (
          <div
            key={i}
            className={`sb-session-chat-line${m.role === "user" ? " sb-session-chat-mine" : ""}`}
          >
            <span className="sb-session-chat-name">
              {m.role === "user"
                ? t("you", { defaultValue: "You" })
                : (m.who ?? t("companion", { defaultValue: "Companion" }))}
            </span>{" "}
            <span className="sb-session-chat-text sb-companion-text">
              {m.role === "assistant"
                ? renderAnswer(m.text, m.cited, m.tags)
                : m.text}
              {!m.text && streaming.value && i === turns.value.length - 1
                ? m.slow
                  ? t("companion-searching", {
                      defaultValue:
                        "Searching every writing the agent holds (about a minute)…",
                    })
                  : "…"
                : ""}
            </span>
            {m.crossRefs && m.crossRefs.length > 0 && (
              <p className="sb-small sb-companion-xrefs">
                {t("companion-read-next", { defaultValue: "Read next:" })}{" "}
                {m.crossRefs.map((x, k) => (
                  <span key={x.label}>
                    {k > 0 && " · "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (!x.book || !x.chapter) return;
                        void state.reading
                          .goTo(
                            state.reading.translationId.value,
                            x.book,
                            x.chapter
                          )
                          .then(
                            () =>
                              x.verse &&
                              state.selection.select(x.verse, x.verse)
                          );
                      }}
                    >
                      {x.label}
                    </a>
                  </span>
                ))}
              </p>
            )}
            {m.cited && m.cited.length > 0 && (
              <details className="sb-small sb-muted sb-companion-sources-wrap">
                <summary>
                  {t("companion-sources", {
                    count: m.cited.length,
                    defaultValue: `Sources (${m.cited.length})`,
                  })}
                </summary>
                <ol className="sb-companion-sources">
                  {m.cited.map((c) => (
                    <li key={c.id}>
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer">
                          {c.title}
                        </a>
                      ) : (
                        c.title
                      )}{" "}
                      <span className="sb-companion-layer">({c.layer})</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {m.suggestions &&
              m.suggestions.length > 0 &&
              i === turns.value.length - 1 &&
              !streaming.value && (
                <div className="sb-companion-suggestions">
                  {m.suggestions.map((sq) => (
                    <button
                      key={sq}
                      type="button"
                      className="sb-note-button sb-small"
                      onClick={() => void ask(state, sq)}
                    >
                      {sq}
                    </button>
                  ))}
                </div>
              )}
            {m.struck ? (
              <p className="sb-small sb-muted">
                {t("companion-struck", {
                  count: m.struck,
                  defaultValue: `${m.struck} sentence(s) struck by the check; hover for why.`,
                })}
              </p>
            ) : null}
            {m.nextStep && m.question && !streaming.value && (
              <button
                type="button"
                className="sb-note-button"
                onClick={() => void ask(state, m.question!, { slow: true })}
              >
                {t("companion-search-writings", {
                  defaultValue: "Search all the writings (about a minute)",
                })}
              </button>
            )}
          </div>
        ))}
      </div>
      {error.value && <p className="sb-pane-error">{error.value}</p>}
      <form
        className="sb-session-say"
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          if (!v || streaming.value) return;
          setQ("");
          void ask(state, v);
        }}
      >
        <input
          className="sb-note-editor"
          value={q}
          placeholder={
            state.session.value
              ? t("companion-ask", {
                  defaultValue: "What should I notice here?",
                })
              : t("companion-sign-in", { defaultValue: "Sign in to ask" })
          }
          disabled={!state.session.value || streaming.value}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
        <button
          type="submit"
          className="sb-note-button sb-note-button-primary"
          disabled={!q.trim() || streaming.value || !state.session.value}
        >
          {t("ask", { defaultValue: "Ask" })}
        </button>
      </form>
      {who.value && (
        <p className="sb-small sb-muted">
          {t("companion-who", {
            who: who.value,
            defaultValue: `Answers by ${who.value}`,
          })}
        </p>
      )}
    </div>
  );
}

const companion: ExtensionRegistration = {
  id: "companion",
  label: "Study companion",
  description:
    "Ask about a verse; the Scripture agent answers from what it holds about it, cited and checked, and says who answered.",
  init: function* (ctx) {
    const { state } = ctx;
    yield ctx.panes.register({
      id: "companion",
      title: "Study companion",
      render: () => <Pane state={state} />,
    });
    yield ctx.toolbar.add({
      id: "companion",
      label: "Study companion",
      icon: "local_fire_department",
      onSelect: () => ctx.panes.open("companion"),
    });
    yield ctx.tools.registerVerseTool({
      id: "companion-ask",
      label: "Ask",
      icon: "local_fire_department",
      priority: 100,
      isVisible: () => !!state.session.value,
      onSelect: (c) => {
        ctx.panes.open("companion");
        void ask(
          state,
          `What should I notice in verse${c.end !== c.start ? `s ${c.start}–${c.end}` : ` ${c.start}`}?`
        );
      },
    });
    yield () => {
      turns.value = [];
      ctx.panes.close("companion");
    };
  },
};
export default companion;
