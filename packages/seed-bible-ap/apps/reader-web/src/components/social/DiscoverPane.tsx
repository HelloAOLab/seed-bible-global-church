// DISCOVER — what Seed Bible agents released for the chapter on screen, from the Seed registry through the
// workspace: published notes, studies, offerings. Dressed by the copied `discover.css` (`sb-discover-*`).
import { sharedPathOf, sharedRefOf } from "../../state/social/sharedPage";
import { useEffect, useState, useRef } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { Offering } from "../../state/social/discover";
import type { DiscoverItem, DiscoverProvider } from "../../extensions/host";

const KIND_ICON: Record<string, string> = {
  note: "sticky_note_2",
  study: "school",
  article: "article",
  video: "play_circle",
  episode: "podcasts",
  playlist: "queue_music",
  plan: "event_note",
  image: "image",
};

export function OfferingItem({
  state,
  o,
}: {
  state: ReaderState;
  o: Offering;
}) {
  const { t } = useI18n();
  const focused = state.discover.focus.value === o.descriptorId;
  const [open, setOpen] = useState(focused);
  const item = useRef<HTMLLIElement>(null);
  // A link to one published note (`?offering=`) opens Discover on it: expanded and scrolled into view.
  useEffect(() => {
    if (focused) {
      setOpen(true);
      state.discover.focus.value = null;
      requestAnimationFrame(() =>
        item.current?.scrollIntoView({ block: "center", behavior: "smooth" })
      );
    }
  }, [focused]);
  const body = open ? state.discover.body(o).value : null;
  const mine = state.backend.identity()?.agent === o.owner;
  const page = sharedRefOf(o);
  const [copied, setCopied] = useState(false);
  return (
    <li
      ref={item}
      className={`sb-discover-item sb-discover-item--row sb-discover-item--clickable${open ? " sb-discover-item--open" : ""}`}
    >
      <button
        type="button"
        className="sb-discover-item-main"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="material-symbols-outlined sb-discover-item-icon">
          {KIND_ICON[o.kind] ?? "auto_stories"}
        </span>
        <span className="sb-discover-item-content">
          <span className="sb-discover-item-title">{o.title}</span>
          <span className="sb-discover-item-description">
            {o.shelf}
            {mine
              ? ` · ${t("discover-yours", { defaultValue: "yours" })}`
              : ""}{" "}
            · {o.passage} · {o.indexedAt.slice(0, 10)}
          </span>
        </span>
      </button>
      {open && (
        <div className="sb-discover-item-body">
          {body === null ? (
            <p className="sb-muted sb-small">
              {t("loading", { defaultValue: "Loading…" })}
            </p>
          ) : body === "" ? (
            <p className="sb-muted sb-small">
              {t("discover-no-body", {
                defaultValue: "This release has no text beside it.",
              })}
            </p>
          ) : (
            <pre className="sb-discover-markdown">{body}</pre>
          )}
          {page && (
            <div className="sb-note-card-actions">
              <button
                type="button"
                className="sb-note-button sb-discover-copy-page"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(`${location.origin}${sharedPathOf(page)}`)
                    .then(() => setCopied(true))
                    .catch(() => undefined)
                }
              >
                {copied
                  ? t("shared-page-copied", {
                      defaultValue: "Page link copied",
                    })
                  : t("shared-copy-page", { defaultValue: "Copy page link" })}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function ProviderSection({
  state,
  provider,
}: {
  state: ReaderState;
  provider: DiscoverProvider;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const chapterRef = state.reading.chapterRef.value;
  const chapter = state.reading.chapterData.value;
  const selected = state.selection.verses.value.join(",");
  useEffect(() => {
    let live = true;
    setItems(null);
    provider
      .discover({
        chapterRef,
        chapter,
        books: state.reading.books.value,
        selectedVerses: state.selection.verses.value,
      })
      .then((r) => live && setItems(r))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [provider.id, chapterRef, chapter, selected]);
  return (
    <div className="sb-content-section">
      <div className="sb-content-section-head">
        <h3 className="sb-content-section-title">{provider.label}</h3>
      </div>
      {items === null && (
        <p className="sb-muted sb-small">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      )}
      {items && !items.length && (
        <p className="sb-content-empty">
          {t("discover-provider-empty", {
            defaultValue: "Nothing for this chapter.",
          })}
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="sb-discover-list">
          {items.map((it) => (
            <li key={it.id} className="sb-discover-item sb-discover-item--row">
              <button
                type="button"
                className="sb-discover-item-main"
                onClick={() => it.onOpen?.()}
              >
                <span className="material-symbols-outlined sb-discover-item-icon">
                  {it.icon ?? "auto_stories"}
                </span>
                <span className="sb-discover-item-content">
                  <span className="sb-discover-item-title">{it.title}</span>
                  {it.description && (
                    <span className="sb-discover-item-description">
                      {it.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiscoverPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const chapterRef = state.reading.chapterRef.value;
  const result = state.discover.forChapter(chapterRef).value;
  const loading = state.discover.loading.value;
  return (
    <section
      className="sb-pane sb-discover-pane"
      aria-label={t("discover", { defaultValue: "Discover" })}
    >
      <header className="sb-pane-header">
        <h2 className="sb-discover-title">
          {t("discover", { defaultValue: "Discover" })} ·{" "}
          {state.reading.bookName.value} {state.reading.chapterNumber.value}
        </h2>
        <div>
          <button
            className="sb-pane-close"
            aria-label={t("refresh", { defaultValue: "Refresh" })}
            title={t("refresh", { defaultValue: "Refresh" })}
            onClick={() => void state.discover.refresh(chapterRef)}
          >
            <span className="material-symbols-outlined">refresh</span>
          </button>
          <button
            className="sb-pane-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={() => (state.ui.pane.value = "none")}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>
      {state.discover.error.value && (
        <p className="sb-pane-error">{state.discover.error.value}</p>
      )}
      {loading && !result && (
        <p className="sb-muted sb-small">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      )}
      {result && !result.offerings.length && (
        <p className="sb-pane-empty">
          {t("discover-empty", {
            defaultValue:
              "Nothing released for this chapter yet. Publish one of your notes to be the first.",
          })}
        </p>
      )}
      {result && result.offerings.length > 0 && (
        <ul className="sb-discover-list">
          {result.offerings.map((o) => (
            <OfferingItem key={o.descriptorId} state={state} o={o} />
          ))}
        </ul>
      )}
      {state.extensions.providers.value.map((p) => (
        <ProviderSection key={p.id} state={state} provider={p} />
      ))}
      <p className="sb-small sb-muted">
        {t("discover-how", {
          defaultValue:
            "The Seed registry indexes what people and churches release on their public shelves; it re-crawls every 15 minutes.",
        })}
      </p>
    </section>
  );
}
