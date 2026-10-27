// COMMUNITY — the old reader's Today feed (packages/seed-bible components/TodayPane/SocialSection): one card of what
// you and your friends have been doing, newest first, with All · Notes · Reading and a History toggle. Notes are what
// friends released (a note, a playlist, a plan); Reading is where a friend is reading now, "You and Ruth both read
// John 3" when that is a chapter you read too, and your own recent chapters. History lists your reading by day.
// Only what friends chose to release or to show (their presence) is here; your private marks never leave you.
import { useEffect, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { RecentReading } from "../../state/records/history";

type Kind = "all" | "notes" | "reading";

interface Row {
  id: string;
  kind: "note" | "reading";
  /** Agents in the sentence, "you" first. */
  who: string[];
  sentence: string;
  reference: string;
  quote?: string;
  at: number;
  open: () => void;
}

const NAME = "\u0001";
const REF = "\u0002";
const RECENT_DAYS = 7;
const DAY_MS = 86_400_000;

function feedTime(ms: number, language: string, yesterday: string) {
  const time = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (time >= today)
    return new Intl.DateTimeFormat(language, {
      hour: "numeric",
      minute: "2-digit",
    }).format(time);
  if (ms >= today.getTime() - DAY_MS) return yesterday;
  return new Intl.DateTimeFormat(language, {
    month: "short",
    day: "numeric",
    ...(time.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  }).format(time);
}

/** A sentence with its names and reference in place (the reference a button that opens it). */
function Sentence(props: {
  sentence: string;
  names: string;
  reference: string;
  onOpen: () => void;
}) {
  const parts: ComponentChildren[] = [];
  let rest = props.sentence;
  let key = 0;
  while (rest) {
    const i = rest.search(/[\u0001\u0002]/);
    if (i < 0) {
      parts.push(rest);
      break;
    }
    if (i > 0) parts.push(rest.slice(0, i));
    parts.push(
      rest[i] === NAME ? (
        <strong key={key++} className="sb-today-feed-name">
          {props.names}
        </strong>
      ) : (
        <button
          key={key++}
          type="button"
          className="sb-today-feed-reference sb-today-clickable"
          onClick={props.onOpen}
        >
          {props.reference}
        </button>
      )
    );
    rest = rest.slice(i + 1);
  }
  return <p className="sb-today-feed-sentence">{parts}</p>;
}

export function CommunityFeed({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const { today, reading } = state;
  const [kind, setKind] = useState<Kind>("all");
  const [history, setHistory] = useState(false);
  const [mine, setMine] = useState<RecentReading[]>([]);
  const [limit, setLimit] = useState(10);
  const me = state.backend.identity()?.agent?.toLowerCase() ?? "";
  useEffect(() => {
    void state.history.recent(60).then(setMine);
  }, [reading.chapterRef.value]);

  const bookName = (id: string) =>
    reading.books.value.find((b) => b.id === id)?.name ?? id;
  const chapterLabel = (chapter: string) => {
    const [b, c] = chapter.split(".");
    return `${bookName(b!)} ${c}`;
  };
  const passageLabel = (passage: string) => {
    const [from, to] = passage.split("-");
    const [b, c, v] = (from ?? passage).split(".");
    const end = to?.split(".")[2];
    return `${bookName(b!)} ${c}${v ? `:${v}${end && end !== v ? `-${end}` : ""}` : ""}`;
  };
  const go = (chapter: string) => {
    const [b, c] = chapter.split(".");
    state.ui.pane.value = "none";
    void reading.goTo(reading.translationId.value, b!, Number(c));
  };
  const nameOf = (agent: string) => {
    const a = agent.toLowerCase();
    if (a === me) return t("you", { defaultValue: "You" });
    const f = today.friends.value.find((c) => c.contact.toLowerCase() === a);
    return today.profiles.value[a]?.displayName ?? f?.name ?? agent.slice(0, 8);
  };
  const names = (agents: string[]) =>
    new Intl.ListFormat(language, { type: "conjunction" }).format(
      agents.map(nameOf)
    );

  const rows: Row[] = [];
  for (const o of today.releases.value) {
    const owner = (o.owner || o.shelf).toLowerCase();
    rows.push({
      id: `release:${o.descriptorId}`,
      kind: "note",
      who: [owner],
      sentence:
        o.kind === "note"
          ? t("feed-noted-on", {
              name: NAME,
              reference: REF,
              defaultValue: "{{name}} noted on {{reference}}",
            })
          : o.kind === "playlist"
            ? t("feed-shared-playlist", {
                name: NAME,
                reference: REF,
                defaultValue: "{{name}} shared a playlist at {{reference}}",
              })
            : t("feed-shared-plan", {
                name: NAME,
                reference: REF,
                defaultValue: "{{name}} shared a reading plan at {{reference}}",
              }),
      reference: passageLabel(o.passage),
      // a note's own first words when its publisher sent them; its title otherwise
      quote:
        typeof o.descriptor?.["schema:abstract"] === "string" &&
        o.descriptor["schema:abstract"]
          ? (o.descriptor["schema:abstract"] as string)
          : o.title,
      at: Date.parse(o.indexedAt) || 0,
      open: () => go(o.passage.split("-")[0]!.split(".").slice(0, 2).join(".")),
    });
  }
  const recentMine = mine.filter(
    (r) => Date.now() - Date.parse(r.at) < RECENT_DAYS * DAY_MS
  );
  for (const f of state.presence.friends.value) {
    for (const p of f.presence) {
      if (!p.scope || !/^[1-4]?[A-Z]{2,3}\.\d+$/.test(p.scope)) continue;
      const both = recentMine.some((r) => r.chapterRef === p.scope);
      rows.push({
        id: `presence:${f.agent}:${p.scope}`,
        kind: "reading",
        who: both ? [me, f.agent.toLowerCase()] : [f.agent.toLowerCase()],
        sentence: both
          ? t("feed-both-read", {
              names: NAME,
              reference: REF,
              defaultValue: "{{names}} both read {{reference}}",
            })
          : t("feed-reading-now", {
              name: NAME,
              reference: REF,
              defaultValue: "{{name}} is reading {{reference}}",
            }),
        reference: chapterLabel(p.scope),
        at: Date.now(),
        open: () => go(p.scope!),
      });
    }
  }
  // Where friends were this past week ("Ruth read John 3"), and the chapters you both read ("You and Ruth both read
  // John 3", which then stands for your own line) — what they let friends see, as the old reader's community reading.
  const bothRead = new Set<string>();
  for (const f of state.presence.friends.value) {
    const live = new Set(f.presence.map((p) => p.scope));
    for (const r of f.recent ?? []) {
      if (!/^[1-4]?[A-Z]{2,3}\.\d+$/.test(r.scope) || live.has(r.scope))
        continue;
      const mineToo = recentMine.find((m) => m.chapterRef === r.scope);
      if (mineToo) bothRead.add(r.scope);
      rows.push({
        id: `recent:${f.agent}:${r.scope}`,
        kind: "reading",
        who: mineToo ? [me, f.agent.toLowerCase()] : [f.agent.toLowerCase()],
        sentence: mineToo
          ? t("feed-both-read", {
              names: NAME,
              reference: REF,
              defaultValue: "{{names}} both read {{reference}}",
            })
          : t("feed-read", {
              name: NAME,
              reference: REF,
              defaultValue: "{{name}} read {{reference}}",
            }),
        reference: chapterLabel(r.scope),
        at: Math.max(r.at, mineToo ? Date.parse(mineToo.at) || 0 : 0),
        open: () => go(r.scope),
      });
    }
  }
  for (const r of recentMine.filter((m) => !bothRead.has(m.chapterRef)))
    rows.push({
      id: `mine:${r.chapterRef}`,
      kind: "reading",
      who: [me],
      sentence: t("feed-read", {
        name: NAME,
        reference: REF,
        defaultValue: "{{name}} read {{reference}}",
      }),
      reference: chapterLabel(r.chapterRef),
      at: Date.parse(r.at) || 0,
      open: () => go(r.chapterRef),
    });
  rows.sort((a, b) => b.at - a.at);
  const shown = rows.filter(
    (r) =>
      kind === "all" ||
      (kind === "notes" ? r.kind === "note" : r.kind === "reading")
  );

  const avatar = (agent: string) => {
    const pic =
      agent === me
        ? state.profile.mine.value?.picture
        : today.profiles.value[agent]?.picture;
    return pic ? (
      <img key={agent} src={pic} alt="" className="sb-today-feed-avatar" />
    ) : (
      <div key={agent} className="sb-today-feed-avatar" title={nameOf(agent)}>
        <span className="material-symbols-outlined">person</span>
      </div>
    );
  };
  const kindLabel = {
    all: t("all", { defaultValue: "All" }),
    notes: t("notes", { defaultValue: "Notes" }),
    reading: t("feed-reading", { defaultValue: "Reading" }),
  };
  const days = new Map<string, RecentReading[]>();
  for (const r of mine) {
    const d = r.at.slice(0, 10);
    days.set(d, [...(days.get(d) ?? []), r]);
  }

  return (
    <div className="sb-today-titled-section sb-today-community">
      <div className="sb-today-titled-section-header">
        <h5>{t("community", { defaultValue: "COMMUNITY" })}</h5>
      </div>
      <div className="sb-today-feed-card">
        <div className="sb-today-feed-toolbar">
          <div className="sb-today-feed-kind-filter">
            {(["all", "notes", "reading"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={kind === id}
                onClick={() => setKind(id)}
                className={`sb-today-feed-kind-option${kind === id ? " sb-today-feed-kind-option-selected" : ""} sb-today-clickable`}
              >
                {kindLabel[id]}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={history}
            aria-label={t("feed-history", { defaultValue: "History" })}
            title={t("feed-history", { defaultValue: "History" })}
            onClick={() => setHistory((h) => !h)}
            className={`sb-today-feed-history-button${history ? " sb-today-feed-history-button-selected" : ""} sb-today-clickable`}
          >
            <span className="material-symbols-outlined">history</span>
          </button>
        </div>
        {history && (
          <ul className="sb-today-feed-list sb-today-history">
            {[...days.entries()].map(([day, list]) => (
              <li key={day} className="sb-today-feed-row">
                <div className="sb-today-feed-row-body">
                  <span className="sb-today-date-label">
                    {new Intl.DateTimeFormat(language, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    }).format(new Date(`${day}T12:00:00`))}
                  </span>
                  <p className="sb-today-feed-sentence">
                    {list.map((r, i) => (
                      <>
                        {i > 0 && ", "}
                        <button
                          key={r.chapterRef}
                          type="button"
                          className="sb-today-feed-reference sb-today-clickable"
                          onClick={() => go(r.chapterRef)}
                        >
                          {chapterLabel(r.chapterRef)}
                        </button>
                      </>
                    ))}
                  </p>
                </div>
              </li>
            ))}
            {!mine.length && (
              <p className="sb-today-feed-empty">
                {t("feed-history-empty", {
                  defaultValue: "Chapters you read will show up here.",
                })}
              </p>
            )}
          </ul>
        )}
        {shown.length > 0 ? (
          <ul className="sb-today-feed-list">
            {shown.slice(0, limit).map((r) => (
              <li
                key={r.id}
                className={`sb-today-feed-row sb-today-feed-row-${r.kind}`}
              >
                <div className="sb-today-feed-avatars">
                  {r.who.slice(0, 3).map(avatar)}
                </div>
                <div className="sb-today-feed-row-body">
                  <Sentence
                    sentence={r.sentence}
                    names={names(r.who)}
                    reference={r.reference}
                    onOpen={r.open}
                  />
                  {r.quote && (
                    <blockquote className="sb-today-feed-note-text">
                      {r.quote}
                    </blockquote>
                  )}
                </div>
                <span className="sb-today-feed-time">
                  {feedTime(
                    r.at,
                    language,
                    t("yesterday", { defaultValue: "Yesterday" })
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sb-today-feed-empty">
            {kind === "notes"
              ? t("feed-empty-notes", {
                  defaultValue: "No notes in this time frame yet.",
                })
              : kind === "reading"
                ? t("feed-empty-reading", {
                    defaultValue: "No reading in this time frame yet.",
                  })
                : t("feed-empty", {
                    defaultValue: "No activity in this time frame yet.",
                  })}
          </p>
        )}
        {shown.length > limit && (
          <button
            type="button"
            className="sb-today-feed-see-more"
            onClick={() => setLimit((n) => n + 10)}
          >
            {t("see-more", { defaultValue: "See more" })}
          </button>
        )}
      </div>
    </div>
  );
}
