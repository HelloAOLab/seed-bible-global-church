// TODAY — the old TodayPane in outline: pick up where you left off, your recent bookmarks and saves, your friends
// from the Home and what they released lately. Dressed by the copied `today.css` / `friends.css` where the
// classes match, and `app.css` for the rest.
import { useEffect, useState } from "preact/hooks";
import type { RecentReading } from "../../state/records/history";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { DEFAULT_ESTATE } from "../../session";
import { estateById } from "../../../../../estate/faithnet";
import { parseRoute } from "../../state/reading/route";

function label(state: ReaderState, chapter: string) {
  const [book, ch] = chapter.split(".");
  return `${state.reading.books.value.find((b) => b.id === book)?.name ?? book} ${ch}`;
}

export function TodayPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { today, bookmarks, saves, reading } = state;
  const signedIn = !!state.session.value;
  const home = estateById(DEFAULT_ESTATE)!.home;

  useEffect(() => {
    if (signedIn && !today.loadedFor.value) void today.refresh();
  }, [signedIn]);
  const [recent, setRecent] = useState<RecentReading[]>([]);
  const changed = state.buckets.changed.value;
  useEffect(() => {
    void state.history.recent(8).then(setRecent);
  }, [changed]);

  const open = (chapter: string, start?: number, end?: number) => {
    const [book, ch] = chapter.split(".");
    void reading
      .goTo(reading.translationId.value, book!, Number(ch))
      .then(() => {
        if (start) state.selection.select(start, end ?? start);
      });
  };
  const openOffering = (passage: string) => {
    const [from] = passage.split("-");
    const parts = (from ?? "").split(".");
    open(`${parts[0]}.${parts[1]}`, parts[2] ? Number(parts[2]) : undefined);
  };

  return (
    <section
      className="sb-pane sb-today-container"
      aria-label={t("today", { defaultValue: "Today" })}
    >
      <header className="sb-pane-header sb-today-header">
        <h2>{t("today", { defaultValue: "Today" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      <div className="sb-content-section">
        <div className="sb-content-section-head">
          <h3 className="sb-content-section-title">
            {t("resume-reading", { defaultValue: "Continue reading" })}
          </h3>
        </div>
        <button
          className="sb-content-save"
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="sb-content-save-kind">
            <span className="material-symbols-outlined">menu_book</span>
          </span>
          <span className="sb-content-save-name">
            {reading.bookName.value} {reading.chapterNumber.value} ·{" "}
            {reading.translation.value?.shortName ??
              reading.translationId.value}
          </span>
        </button>
      </div>

      {recent.length > 0 && (
        <div className="sb-content-section">
          <div className="sb-content-section-head">
            <h3 className="sb-content-section-title">
              {t("recent-reading", { defaultValue: "Recent reading" })}
            </h3>
          </div>
          <div className="sb-recent-chips">
            {recent.map((r) => (
              <button
                key={r.chapterRef}
                className="sb-recent-chip"
                title={new Date(r.at).toLocaleString()}
                onClick={() => {
                  const [book, ch] = r.chapterRef.split(".");
                  void reading.goTo(
                    r.edition ?? reading.translationId.value,
                    book!,
                    Number(ch)
                  );
                  state.ui.pane.value = "none";
                }}
              >
                {label(state, r.chapterRef)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sb-content-section">
        <div className="sb-content-section-head">
          <h3 className="sb-content-section-title">
            {t("bookmarks", { defaultValue: "Bookmarks" })}
          </h3>
        </div>
        {!bookmarks.all.value.length && (
          <p className="sb-content-empty">
            {t("today-no-bookmarks", { defaultValue: "No bookmarks yet." })}
          </p>
        )}
        {bookmarks.all.value.slice(0, 5).map((b) => (
          <button
            key={b.id}
            className="sb-content-save"
            onClick={() => open(b.chapter)}
          >
            <span className="sb-content-save-kind">
              <span className="material-symbols-outlined">bookmark</span>
            </span>
            <span className="sb-content-save-name">{b.name}</span>
            <span className="sb-content-save-date">
              {b.updatedAt.slice(0, 10)}
            </span>
          </button>
        ))}
      </div>

      <div className="sb-content-section">
        <div className="sb-content-section-head">
          <h3 className="sb-content-section-title">
            {t("saves", { defaultValue: "Saves" })}
          </h3>
        </div>
        {!saves.all.value.length && (
          <p className="sb-content-empty">
            {t("today-no-saves", { defaultValue: "No saves yet." })}
          </p>
        )}
        {saves.all.value.slice(0, 5).map((s) => (
          <button
            key={s.id}
            className="sb-content-save"
            onClick={() =>
              open(s.chapter, s.start ?? undefined, s.end ?? undefined)
            }
          >
            <span className="sb-content-save-kind">
              <span className="material-symbols-outlined">
                {s.start !== null ? "format_quote" : "archive"}
              </span>
            </span>
            <span className="sb-content-save-name">
              {s.label ??
                `${label(state, s.chapter)}${s.start !== null ? `:${s.start}${s.end !== s.start ? `–${s.end}` : ""}` : ""}`}
            </span>
          </button>
        ))}
      </div>

      <div className="sb-content-section sb-friends-section">
        <div className="sb-content-section-head">
          <h3 className="sb-content-section-title">
            {t("friends", { defaultValue: "Friends" })}
          </h3>
          {signedIn && (
            <button
              className="sb-content-see-all"
              onClick={() => void today.refresh()}
              disabled={today.contactsLoading.value}
            >
              {t("refresh", { defaultValue: "Refresh" })}
            </button>
          )}
        </div>
        {!signedIn && (
          <p className="sb-content-empty">
            {t("today-signed-out", {
              defaultValue:
                "Sign in to see your friends and what they released.",
            })}
          </p>
        )}
        {signedIn && today.contactsError.value && (
          <p className="sb-pane-error">{today.contactsError.value}</p>
        )}
        {signedIn &&
          !today.contactsLoading.value &&
          !today.friends.value.length &&
          !today.contactsError.value && (
            <p className="sb-content-empty">
              {t("today-no-friends", {
                defaultValue:
                  "No contacts yet. Friends are the contacts at your Home.",
              })}{" "}
              <a href={`${home}/you`} target="_blank" rel="noreferrer">
                {t("today-add-at-home", {
                  defaultValue: "Add people at your Home",
                })}
              </a>
            </p>
          )}
        {today.friends.value.map((c) => (
          <div key={c.contact} className="sb-friends-row">
            <span className="sb-friends-person-text">
              <span className="sb-friends-person-name">
                {c.name ?? c.contact}
              </span>
              <span className="sb-friends-person-subtitle">
                {c.name ? c.contact : ""}
                {c.mutual
                  ? ` · ${t("friends-mutual", { defaultValue: "mutual" })}`
                  : ""}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="sb-content-section">
        <div className="sb-content-section-head">
          <h3 className="sb-content-section-title">
            {t("today-friends-released", {
              defaultValue: "What your friends released",
            })}
          </h3>
        </div>
        {today.feedError.value && (
          <p className="sb-pane-error">{today.feedError.value}</p>
        )}
        {signedIn &&
          today.friends.value.length > 0 &&
          !today.feed.value.length &&
          !today.feedLoading.value && (
            <p className="sb-content-empty">
              {t("today-feed-empty", {
                defaultValue: "Nothing released by your friends yet.",
              })}
            </p>
          )}
        {today.feed.value.map((o) => (
          <button
            key={o.descriptorId}
            className="sb-content-quote"
            onClick={() => openOffering(o.passage)}
          >
            <span className="sb-content-quote-ref">
              {o.title} · {o.shelf}
            </span>
            <span className="sb-content-quote-text">
              {o.kind} · {o.passage} · {o.indexedAt.slice(0, 10)}
            </span>
          </button>
        ))}
      </div>
      <p className="sb-small sb-muted">
        {t("today-how", {
          defaultValue:
            "Friends see only what you publish. Your private marks never leave your Library.",
        })}{" "}
        {parseRoute(location.pathname) ? "" : ""}
      </p>
    </section>
  );
}
