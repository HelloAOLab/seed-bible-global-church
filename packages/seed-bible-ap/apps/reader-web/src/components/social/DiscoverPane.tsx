// DISCOVER — the old reader's Discover pane for the chapter on screen: + Create (a note, a playlist), NOTES (yours and
// what people shared for it, or "Create a note"), then each source's sections. Dressed by the copied `discover.css`.
import { sharedPathOf, sharedRefOf } from "../../state/social/sharedPage";
import { useEffect, useState, useRef } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { Offering } from "../../state/social/discover";
import { ContentCards, byAuthor } from "./ContentCards";
import { ChapterNotes, createNote, SectionedRows } from "./DiscoverPanel";
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

const OPEN_KEY = "sb.discover.open";
/** The sources this person opened, remembered on this device (a convenience: any can be lost, all start folded). */
function openSources(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
function rememberOpen(id: string, open: boolean) {
  try {
    const now = new Set(openSources());
    if (open) now.add(id);
    else now.delete(id);
    localStorage.setItem(OPEN_KEY, JSON.stringify([...now]));
  } catch {
    /* storage blocked: it folds again next time */
  }
}

/** A source in Discover: one line — its name, how many it has, an arrow — folded until tapped, so the pane stays short. */
export function ProviderSection({
  state,
  provider,
}: {
  state: ReaderState;
  provider: DiscoverProvider;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  const [open, setOpen] = useState(() => openSources().includes(provider.id));
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
  }, [
    provider.id,
    chapterRef,
    chapter,
    selected,
    state.extensions.settings.value,
  ]);
  // A source with nothing for this chapter takes no room, as in the old reader.
  if (items && !items.length) return null;
  return (
    <div
      className={`sb-content-section sb-discover-source${open ? " sb-discover-source--open" : ""}`}
    >
      <button
        type="button"
        className="sb-discover-source-head"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          rememberOpen(provider.id, !open);
        }}
      >
        <span className="sb-discover-source-title">{provider.label}</span>
        <span className="sb-discover-fold-count">
          {items === null ? "…" : items.length}
        </span>
        <span
          className={`material-symbols-outlined sb-discover-source-arrow${open ? "" : " sb-discover-source-arrow--closed"}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {open && items === null && (
        <p className="sb-muted sb-small">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      )}
      {open && items && byAuthor(items).groups.length > 0 && (
        <ContentCards groups={byAuthor(items).groups} />
      )}
      {open && items && byAuthor(items).rest.length > 0 && (
        <SectionedRows items={byAuthor(items).rest} />
      )}
    </div>
  );
}

export function DiscoverPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const chapterRef = state.reading.chapterRef.value;
  // Opening Discover reads what was shared afresh: there is no Refresh to find.
  useEffect(() => {
    void state.discover.refresh(chapterRef);
  }, [chapterRef]);
  return (
    <section
      className="sb-pane sb-discover-pane"
      aria-label={t("discover", { defaultValue: "Discover" })}
    >
      <header className="sb-pane-header">
        <h2 className="sb-discover-title">
          {t("discover", { defaultValue: "Discover" })}
        </h2>
        <div className="sb-discover-header-actions">
          <div className="sb-discover-create">
            <button
              type="button"
              className="sb-dcp-create-btn"
              aria-haspopup="menu"
              aria-expanded={creating}
              onClick={() => setCreating(!creating)}
            >
              + {t("create-playlist", { defaultValue: "Create" })}
            </button>
            {creating && (
              <div className="sb-discover-create-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCreating(false);
                    createNote(state);
                  }}
                >
                  <span className="material-symbols-outlined">
                    sticky_note_2
                  </span>
                  {t("note", { defaultValue: "Note" })}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setCreating(false);
                    state.ui.libraryTab.value = "playlists";
                    state.ui.pane.value = "library";
                  }}
                >
                  <span className="material-symbols-outlined">queue_music</span>
                  {t("create-playlist-menu-item", { defaultValue: "Playlist" })}
                </button>
              </div>
            )}
          </div>
          <button
            className="sb-pane-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={() => (state.ui.pane.value = "none")}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>
      <ChapterNotes state={state} empty />
      {state.extensions.providers.value.map((p) => (
        <ProviderSection key={p.id} state={state} provider={p} />
      ))}
    </section>
  );
}
