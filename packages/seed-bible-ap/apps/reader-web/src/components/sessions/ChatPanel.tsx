// CHAT — the old reader's floating chat panel and chat view (packages/seed-bible components/FloatingReaderPanels,
// ChatView): above the reader bar, a list of chats (the live session's, and the study companion), and the session's
// chat itself: lines grouped by person, "Ruth joined", "Ruth is typing…", Bible references that open the passage,
// and @mentions (@everyone or a person) with a picker as you type. Lines that came while the chat was closed count on
// the bar's Chat button ("@" when one names you).
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { ChatFrame } from "../../backend/room";
import type { TranslationBook } from "../../backend/bible";
import { colorOf } from "./PresenceGutter";

type Translate = ReturnType<typeof useI18n>["t"];

const GROUP_GAP_MS = 5 * 60_000;
const TYPING_RESEND_MS = 3000;

/** A Bible reference found in a line: where it is in the text and where it goes. */
interface FoundReference {
  start: number;
  end: number;
  bookId: string;
  chapter: number;
  from?: number;
  to?: number;
}

/** References like "John 3:16", "1 Cor 13", "Romans 8:28-30" in a line, by the book names of the open translation. */
export function findReferences(
  text: string,
  books: readonly Pick<TranslationBook, "id" | "name" | "commonName">[]
): FoundReference[] {
  const names = new Map<string, string>();
  for (const b of books)
    for (const n of [b.name, b.commonName, b.id])
      if (n && n.length >= 2) names.set(n.toLowerCase(), b.id);
  if (!names.size) return [];
  const alternatives = [...names.keys()]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(
    `(^|[^\\p{L}\\d])(${alternatives.join("|")})\\.?\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?)?(?![\\p{L}\\d])`,
    "giu"
  );
  const out: FoundReference[] = [];
  for (const m of text.matchAll(re)) {
    const lead = m[1]!.length;
    const start = m.index! + lead;
    const from = m[4] ? Number(m[4]) : undefined;
    out.push({
      start,
      end: m.index! + m[0].length,
      bookId: names.get(m[2]!.toLowerCase())!,
      chapter: Number(m[3]),
      ...(from ? { from, to: m[5] ? Number(m[5]) : from } : {}),
    });
  }
  return out;
}

/** A line's text with its references as links and its @mentions marked (yours stronger). */
function Body(props: {
  text: string;
  books: readonly TranslationBook[];
  people: readonly string[];
  myName: string;
  onReference: (r: FoundReference) => void;
}) {
  const refs = findReferences(props.text, props.books);
  const parts: ComponentChildren[] = [];
  let at = 0;
  const mention = (chunk: string, key: string) => {
    const names = ["everyone", ...props.people]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`@(${names.join("|")})`, "gi");
    const out: ComponentChildren[] = [];
    let i = 0;
    for (const m of chunk.matchAll(re)) {
      if (m.index! > i) out.push(chunk.slice(i, m.index));
      const self =
        m[1]!.toLowerCase() === "everyone" ||
        m[1]!.toLowerCase() === props.myName.toLowerCase();
      out.push(
        <span
          key={`${key}:${m.index}`}
          className={`sb-chat-mention${self ? " sb-chat-mention-self" : ""}`}
        >
          {m[0]}
        </span>
      );
      i = m.index! + m[0].length;
    }
    if (i < chunk.length) out.push(chunk.slice(i));
    return out;
  };
  refs.forEach((r, n) => {
    if (r.start > at)
      parts.push(...mention(props.text.slice(at, r.start), `t${n}`));
    parts.push(
      <a
        key={`r${n}`}
        href="#"
        className="sb-verse-reference-link"
        onClick={(e) => {
          e.preventDefault();
          props.onReference(r);
        }}
      >
        {props.text.slice(r.start, r.end)}
      </a>
    );
    at = r.end;
  });
  if (at < props.text.length)
    parts.push(...mention(props.text.slice(at), "end"));
  return <>{parts}</>;
}

function Avatar(props: { agent: string; name: string }) {
  return (
    <span
      className="sb-tab-user-icon sb-tab-user-icon-animal"
      title={props.name}
      style={{
        borderColor: colorOf(props.agent),
        backgroundColor: colorOf(props.agent),
      }}
    >
      <span className="material-symbols-outlined">person</span>
    </span>
  );
}

function when(iso: string, language: string): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat(language, {
        hour: "numeric",
        minute: "2-digit",
      }).format(d)
    : new Intl.DateTimeFormat(language, {
        month: "short",
        day: "numeric",
      }).format(d);
}

function typingLabel(t: Translate, names: string[]): string {
  if (names.length === 1)
    return t("x-is-typing", {
      defaultValue: "{{name}} is typing...",
      name: names[0],
    });
  if (names.length === 2)
    return t("x-and-x-are-typing", {
      defaultValue: "{{first}} and {{second}} are typing...",
      first: names[0],
      second: names[1],
    });
  return t("x-is-typing-and-more", {
    defaultValue: "{{name}} and {{count}} others are typing...",
    name: names[0],
    count: names.length - 1,
  });
}

function joinLabel(t: Translate, names: string[]): string {
  if (names.length === 1)
    return t("chat-x-joined", {
      defaultValue: "{{name}} joined",
      name: names[0],
    });
  if (names.length === 2)
    return t("chat-x-and-x-joined", {
      defaultValue: "{{first}} and {{second}} joined",
      first: names[0],
      second: names[1],
    });
  return t("chat-x-and-count-joined", {
    defaultValue: "{{name}} and {{count}} others joined",
    name: names[0],
    count: names.length - 1,
  });
}

type Group =
  | { kind: "lines"; key: string; by: string; name: string; lines: ChatFrame[] }
  | { kind: "join"; key: string; names: string[]; at: string };

function SessionChat({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const live = state.live;
  const me = live.me.value;
  const myName = live.guest.value?.name ?? state.backend.identity()?.name ?? "";
  const people = (live.state.value?.participants ?? [])
    .filter((p) => p.agent !== me && p.connections > 0)
    .map((p) => ({ agent: p.agent, name: p.name }));
  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState(0);
  const [pick, setPick] = useState(0);
  const [stamp, setStamp] = useState<number | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  /** Where the caret goes once a picked name is in the box (before the next key is typed). */
  const caretAt = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caretAt.current === null) return;
    input.current?.focus();
    input.current?.setSelectionRange(caretAt.current, caretAt.current);
    caretAt.current = null;
  }, [draft]);

  const groups = useMemo(() => {
    const rows: Array<
      | { at: string; line: ChatFrame }
      | { at: string; join: string[]; key: string }
    > = [
      ...live.chat.value.map((line) => ({ at: line.at, line })),
      ...live.chatEvents.value.map((e) => ({
        at: e.at,
        join: e.names,
        key: e.key,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    const out: Group[] = [];
    for (const r of rows) {
      if ("join" in r) {
        out.push({ kind: "join", key: r.key, names: r.join, at: r.at });
        continue;
      }
      const last = out[out.length - 1];
      if (
        last?.kind === "lines" &&
        last.by === r.line.by &&
        Date.parse(r.line.at) -
          Date.parse(last.lines[last.lines.length - 1]!.at) <
          GROUP_GAP_MS
      )
        last.lines.push(r.line);
      else
        out.push({
          kind: "lines",
          key: `l${r.line.seq}`,
          by: r.line.by,
          name: r.line.name,
          lines: [r.line],
        });
    }
    return out;
  }, [live.chat.value, live.chatEvents.value]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [groups.length, live.chat.value.length]);
  useEffect(() => () => void live.setTyping(false), []);

  // "@ru" before the cursor: the people (and everyone) whose names start so.
  const before = draft.slice(0, cursor);
  const at = /(^|\s)@([^\s@]*)$/.exec(before);
  const q = at ? at[2]!.toLowerCase() : null;
  const everyone = q !== null && "everyone".startsWith(q);
  const matches =
    q === null ? [] : people.filter((p) => p.name.toLowerCase().startsWith(q));
  const options = [
    ...(everyone ? [{ agent: "@everyone", name: "everyone" }] : []),
    ...matches,
  ];
  const picking = q !== null;
  const choose = (name: string) => {
    const startAt = before.length - (q?.length ?? 0) - 1;
    const next = `${draft.slice(0, startAt)}@${name} ${draft.slice(cursor)}`;
    setDraft(next);
    const pos = startAt + name.length + 2;
    setCursor(pos);
    setPick(0);
    caretAt.current = pos;
  };
  const send = () => {
    const v = draft.trim();
    if (!v) return;
    void live.say(v);
    void live.setTyping(false);
    lastTyping.current = 0;
    setDraft("");
    setCursor(0);
  };
  const openReference = (r: FoundReference) => {
    const reading = state.reading;
    void reading
      .goTo(reading.translationId.value, r.bookId, r.chapter)
      .then(() => {
        if (r.from) state.selection.select(r.from, r.to ?? r.from);
      });
    if (window.innerWidth <= 720) state.ui.chatOpen.value = false;
  };
  const typingNames = Object.values(live.typing.value).map((x) => x.name);

  return (
    <div className="sb-chat-view">
      <div
        className="sb-chat-view-messages"
        ref={log}
        role="log"
        aria-live="polite"
      >
        {groups.length === 0 ? (
          <div className="sb-chat-view-empty">
            <span
              className="material-symbols-outlined sb-chat-view-empty-icon"
              aria-hidden="true"
            >
              forum
            </span>
            <p className="sb-chat-view-empty-title">
              {t("start-conversation", {
                defaultValue: "Start a conversation",
              })}
            </p>
          </div>
        ) : (
          groups.map((g) =>
            g.kind === "join" ? (
              <div className="sb-chat-view-event" key={g.key}>
                <span className="sb-chat-view-event-text">
                  {joinLabel(t, g.names)}
                </span>
                <span className="sb-chat-view-event-time">
                  {when(g.at, language)}
                </span>
              </div>
            ) : (
              <section
                key={g.key}
                className={`sb-chat-view-message-group ${g.by === me ? "is-self" : ""}`}
              >
                <div className="sb-chat-view-message-group-row">
                  <div className="sb-chat-view-message-content">
                    <header className="sb-chat-view-message-header">
                      <span className="sb-chat-view-message-author">
                        {g.by === me
                          ? t("you", { defaultValue: "You" })
                          : g.name}
                      </span>
                    </header>
                    <div className="sb-chat-view-message-bubbles">
                      {g.lines.map((line) => (
                        <article
                          key={line.seq}
                          className="sb-chat-view-message"
                          data-message-id={line.seq}
                          onClick={() =>
                            setStamp(stamp === line.seq ? null : line.seq)
                          }
                        >
                          <p className="sb-chat-view-message-body">
                            <Body
                              text={line.text}
                              books={state.reading.books.value}
                              people={[...people.map((p) => p.name), myName]}
                              myName={myName}
                              onReference={openReference}
                            />
                          </p>
                          {stamp === line.seq && (
                            <span className="sb-chat-view-message-timestamp">
                              {when(line.at, language)}
                            </span>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                  <div className="sb-chat-view-message-avatar-shell">
                    <Avatar agent={g.by} name={g.name} />
                  </div>
                </div>
              </section>
            )
          )
        )}
      </div>

      <div className="sb-chat-view-compose-shell">
        {typingNames.length > 0 && (
          <div
            className="sb-chat-view-typing-indicator"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="sb-chat-view-typing-dots" aria-hidden="true">
              <span className="sb-chat-view-typing-dot" />
              <span className="sb-chat-view-typing-dot" />
              <span className="sb-chat-view-typing-dot" />
            </span>
            <span className="sb-chat-view-typing-text">
              {typingLabel(t, typingNames)}
            </span>
          </div>
        )}
        {picking && (
          <div
            className="sb-chat-view-mention-picker"
            role="listbox"
            aria-label={t("participants", { defaultValue: "Participants" })}
          >
            {options.length === 0 ? (
              <div className="sb-chat-view-mention-picker-empty">
                {t("no-participants-match", {
                  defaultValue: "No participants match",
                })}
              </div>
            ) : (
              <div className="sb-chat-view-mention-picker-list">
                {options.map((o, i) => (
                  <button
                    key={o.agent}
                    type="button"
                    role="option"
                    aria-selected={i === pick}
                    className={`sb-chat-view-mention-picker-item${i === pick ? " is-selected" : ""}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o.name)}
                  >
                    <span className="sb-chat-view-mention-picker-name">
                      {o.agent === "@everyone"
                        ? t("everyone", { defaultValue: "Everyone" })
                        : o.name}
                    </span>
                    <span className="sb-chat-view-mention-picker-meta">
                      @{o.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <form
          className="sb-chat-view-compose"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="sb-chat-view-input-wrap">
            <textarea
              ref={input}
              className="sb-chat-view-input"
              rows={1}
              placeholder={t("type-a-message", {
                defaultValue: "Type a message...",
              })}
              aria-label={t("type-a-message", {
                defaultValue: "Type a message...",
              })}
              aria-autocomplete="list"
              aria-expanded={picking}
              aria-haspopup="listbox"
              value={draft}
              onInput={(e) => {
                const el = e.currentTarget as HTMLTextAreaElement;
                setDraft(el.value);
                setCursor(el.selectionStart ?? el.value.length);
                setPick(0);
                const now = Date.now();
                if (
                  el.value.trim() &&
                  now - lastTyping.current > TYPING_RESEND_MS
                ) {
                  lastTyping.current = now;
                  void live.setTyping(true);
                }
              }}
              onKeyUp={(e) =>
                setCursor(
                  (e.currentTarget as HTMLTextAreaElement).selectionStart ?? 0
                )
              }
              onClick={(e) =>
                setCursor(
                  (e.currentTarget as HTMLTextAreaElement).selectionStart ?? 0
                )
              }
              onBlur={() => {
                void live.setTyping(false);
                lastTyping.current = 0;
              }}
              onKeyDown={(e: KeyboardEvent) => {
                if (picking && options.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const d = e.key === "ArrowDown" ? 1 : -1;
                    setPick((pick + d + options.length) % options.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    choose(options[pick]!.name);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
          </div>
          <button
            type="submit"
            className="sb-chat-view-send"
            disabled={!draft.trim()}
            aria-label={t("send-message", { defaultValue: "Send message" })}
            title={t("send-message", { defaultValue: "Send message" })}
          >
            <span
              className="material-symbols-outlined rtl-mirror"
              aria-hidden="true"
            >
              send
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

export function ChatPanel({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const { ui, live } = state;
  const open = ui.chatOpen.value;
  const inSession = ui.chatView.value === "session";
  const setInSession = (on: boolean) =>
    (ui.chatView.value = on ? "session" : "list");
  const viewing = open && inSession && live.active.value;

  useEffect(() => {
    live.chatOnScreen.value = viewing;
    if (viewing) live.markRead();
  }, [viewing, live.chat.value.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      ui.chatOpen.value = false;
    };
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        !el ||
        el.closest(
          ".sb-floating-chat-panel, .sb-reader-toolbar, .sb-phone-nav, .sb-context-menu, .sb-footnote-modal-overlay"
        )
      )
        return;
      ui.chatOpen.value = false;
    };
    window.addEventListener("keydown", onKey, true);
    // After this tap: the one that opened the panel must not close it.
    const id = setTimeout(
      () => document.addEventListener("pointerdown", onDown),
      0
    );
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(id);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!open) return null;
  const s = live.state.value;
  const showingSession = inSession && live.active.value;
  const last = live.chat.value[live.chat.value.length - 1];
  const others = (s?.participants ?? []).filter(
    (p) => p.agent !== live.me.value && p.connections > 0
  );
  const sessionTitle = t("session-chat-title", {
    defaultValue: "Session chat",
  });
  const unread = live.unread.value.length;

  return (
    <div
      className="sb-floating-chat-panel"
      role="dialog"
      aria-label={t("chat", { defaultValue: "Chat" })}
    >
      <header className="sb-floating-chat-header">
        {showingSession && (
          <button
            type="button"
            className="sb-floating-chat-header-back"
            aria-label={t("back", { defaultValue: "Back" })}
            title={t("back", { defaultValue: "Back" })}
            onClick={() => setInSession(false)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
          </button>
        )}
        {showingSession ? (
          <div
            className={`sb-chat-list-avatar-cluster sb-chat-list-avatar-cluster-${Math.min(Math.max(others.length, 1), 3)}`}
            aria-hidden="true"
          >
            {others.slice(0, 3).map((p) => (
              <Avatar key={p.agent} agent={p.agent} name={p.name} />
            ))}
          </div>
        ) : (
          <span
            className="material-symbols-outlined sb-floating-chat-header-icon"
            aria-hidden="true"
          >
            chat_bubble_outline
          </span>
        )}
        <p className="sb-floating-chat-header-title">
          {showingSession ? sessionTitle : t("chat", { defaultValue: "Chat" })}
        </p>
        <button
          type="button"
          className="sb-floating-chat-header-close"
          aria-label={t("close", { defaultValue: "Close" })}
          title={t("close", { defaultValue: "Close" })}
          onClick={() => (ui.chatOpen.value = false)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
      </header>

      {showingSession ? (
        <SessionChat state={state} />
      ) : (
        <div className="sb-floating-chat-list-shell">
          <div className="sb-floating-chat-list" role="listbox">
            {live.active.value && (
              <button
                type="button"
                role="option"
                aria-selected="false"
                className="sb-floating-chat-list-item"
                title={sessionTitle}
                onClick={() => setInSession(true)}
              >
                <div
                  className={`sb-chat-list-avatar-cluster sb-chat-list-avatar-cluster-${Math.min(Math.max(others.length, 1), 3)}`}
                  aria-hidden="true"
                >
                  {others.slice(0, 3).map((p) => (
                    <Avatar key={p.agent} agent={p.agent} name={p.name} />
                  ))}
                </div>
                <div className="sb-floating-chat-list-item-content">
                  <div className="sb-floating-chat-list-item-header">
                    <span className="sb-floating-chat-list-item-title">
                      {sessionTitle}
                    </span>
                    <div className="sb-floating-chat-list-item-meta">
                      {last && (
                        <span className="sb-floating-chat-list-item-time">
                          {when(last.at, language)}
                        </span>
                      )}
                      {unread > 0 && (
                        <span className="sb-floating-chat-list-item-unread">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="sb-floating-chat-list-item-preview">
                    {last
                      ? `${last.by === live.me.value ? t("you", { defaultValue: "You" }) : last.name}: ${last.text}`
                      : t("start-conversation", {
                          defaultValue: "Start a conversation",
                        })}
                  </p>
                </div>
              </button>
            )}
            <button
              type="button"
              role="option"
              aria-selected="false"
              className="sb-floating-chat-list-item"
              onClick={() => {
                ui.chatOpen.value = false;
                ui.pane.value = "ext:companion";
              }}
            >
              <span
                className="material-symbols-outlined sb-floating-chat-header-icon"
                aria-hidden="true"
              >
                local_fire_department
              </span>
              <div className="sb-floating-chat-list-item-content">
                <div className="sb-floating-chat-list-item-header">
                  <span className="sb-floating-chat-list-item-title">
                    {t("study-companion", { defaultValue: "Study companion" })}
                  </span>
                </div>
                <p className="sb-floating-chat-list-item-preview">
                  {t("study-companion-preview", {
                    defaultValue: "Ask about the chapter",
                  })}
                </p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The bar's Chat badge: "@" when an unread line names you, else how many. */
export function chatBadge(state: ReaderState): string | undefined {
  const n = state.live.unread.value.length;
  if (!n) return undefined;
  if (state.live.mentioned.value) return "@";
  return n > 99 ? "99+" : String(n);
}
