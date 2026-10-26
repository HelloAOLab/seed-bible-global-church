// THE STUDY COMPANION — what the Bonfire extension becomes on the estate (hard-problems §9): a question about the
// chapter on screen, answered by the serving plane's model, streamed through reader-a2a to this pane, which
// names whose answer it is. The browser never calls a model or holds a key; a signed-in reader asks.
import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import type { ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import { A2A_BASE } from "../../api";
import { getVersePlainText } from "../../components/reader/chapterContent";
import { useI18n } from "../../i18n";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  who?: string;
}

const turns = signal<Turn[]>([]);
const streaming = signal(false);
const who = signal<string | null>(null);
const error = signal<string | null>(null);

/** Workers AI streams `data: {"response":"…"}` lines; the serving plane prefixes an `event: who` line. */
export function parseSse(
  chunk: string,
  onText: (t: string) => void,
  onWho: (w: string) => void
): string {
  const lines = chunk.split("\n");
  const rest = lines.pop() ?? "";
  let event = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) {
      const data = line.slice(5).trim();
      if (event === "who") onWho(data);
      else if (data && data !== "[DONE]") {
        try {
          const j = JSON.parse(data) as { response?: string };
          if (typeof j.response === "string") onText(j.response);
        } catch {
          /* not JSON */
        }
      }
      event = "";
    } else if (line === "") event = "";
  }
  return rest;
}

export async function ask(
  state: ReaderState,
  question: string,
  signal?: AbortSignal
) {
  const s = state.session.value;
  if (!s) throw new Error("sign in to ask the companion");
  const chapter = state.reading.chapterData.value;
  const text = (chapter?.chapter.content ?? [])
    .filter(
      (e): e is Extract<typeof e, { type: "verse" }> =>
        !!e && typeof e === "object" && e.type === "verse"
    )
    .map((v) => `${v.number} ${getVersePlainText(v.content)}`)
    .join("\n")
    .slice(0, 12_000);
  const selected = state.selection.verses.value;
  const passage = `${state.reading.bookName.value} ${state.reading.chapterNumber.value}${selected.length ? `:${selected[0]}${selected.length > 1 ? `–${selected[selected.length - 1]}` : ""}` : ""} (${state.reading.translationId.value})`;
  turns.value = [
    ...turns.value,
    { role: "user", text: question },
    { role: "assistant", text: "" },
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
        passage,
        text,
        question,
        history: turns.value.slice(0, -2).slice(-6),
      }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(j?.error ?? `the companion answered ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let rest = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rest = parseSse(
        rest + dec.decode(value, { stream: true }),
        (t) => {
          const all = [...turns.value];
          const last = all[all.length - 1]!;
          all[all.length - 1] = {
            ...last,
            text: last.text + t,
            ...(who.value ? { who: who.value } : {}),
          };
          turns.value = all;
        },
        (w) => (who.value = w)
      );
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    streaming.value = false;
  }
}

function Pane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  return (
    <div className="sb-companion">
      <p className="sb-small sb-muted">
        {t("companion-blurb", {
          defaultValue:
            "Ask about the chapter on screen (or the verses you selected). The answer comes from the estate's study model, not from a person.",
        })}
      </p>
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
              {m.text ||
                (streaming.value && i === turns.value.length - 1 ? "…" : "")}
            </span>
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
    "Ask about the chapter; the estate's model answers, streamed, and says who answered.",
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
          `What should I notice in verses ${c.start}${c.end !== c.start ? `–${c.end}` : ""}?`
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
