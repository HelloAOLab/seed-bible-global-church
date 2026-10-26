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

/** How many of a source's rows show before "Show all" (a source split into sections folds by section instead). */
const FIRST = 5;

/** Each source's chip, short as the old reader's (All · Content · People · Events · References). */
const CHIP: Record<string, string> = {
  scrolls: "Scrolls",
  references: "References",
  locations: "Places",
  "default-content": "Content",
  theographic: "People & events",
  interpretations: "Interpretations",
  writings: "Writings",
};

/** A source in Discover. Under All it is one line — its name and how many it has — and tapping it shows that source
 *  alone (`full`), as its chip does; while another source is shown it stays loaded, out of sight, so its chip keeps
 *  its count. */
export function ProviderSection({
  state,
  provider,
  mode,
  onPick,
  onCount,
}: {
  state: ReaderState;
  provider: DiscoverProvider;
  mode: "line" | "full" | "hidden";
  onPick: () => void;
  onCount: (n: number | null) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<DiscoverItem[] | null>(null);
  /** The selected verses had nothing from this source, so these are the whole chapter's. */
  const [widened, setWidened] = useState(false);
  const [all, setAll] = useState(false);
  const chapterRef = state.reading.chapterRef.value;
  const chapter = state.reading.chapterData.value;
  const selected = state.selection.verses.value.join(",");
  useEffect(() => {
    let live = true;
    setItems(null);
    onCount(null);
    setWidened(false);
    setAll(false);
    const ask = (selectedVerses: number[]) =>
      provider.discover({
        chapterRef,
        chapter,
        books: state.reading.books.value,
        selectedVerses,
      });
    const verses = state.selection.verses.value;
    // Nothing at the selected verses is not nothing at all: the chapter's are shown, and said to be the chapter's,
    // so a source never vanishes just because the wrong verse was tapped.
    ask(verses)
      .then(async (r) => {
        if (r.length || !verses.length) {
          if (live) (setItems(r), onCount(r.length));
          return;
        }
        const wide = await ask([]);
        if (!live) return;
        setWidened(wide.length > 0);
        setItems(wide);
        onCount(wide.length);
      })
      .catch(() => live && (setItems([]), onCount(0)));
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
  if (mode === "hidden" || (items && !items.length)) return null;
  const rest = items ? byAuthor(items).rest : [];
  // A source split into sections (People, Places, Events) folds by section instead of being cut at five.
  const sectioned = rest.some((it) => it.section);
  if (mode === "line")
    return (
      <div className="sb-content-section sb-discover-source">
        <button
          type="button"
          className="sb-discover-source-head"
          onClick={onPick}
        >
          <span className="sb-discover-source-title">{provider.label}</span>
          <span className="sb-discover-fold-count">
            {items === null ? "…" : items.length}
          </span>
          <span
            className="material-symbols-outlined sb-discover-source-arrow"
            aria-hidden="true"
          >
            chevron_right
          </span>
        </button>
      </div>
    );
  return (
    <div className="sb-content-section sb-discover-source sb-discover-source--open">
      <h3 className="sb-discover-source-title sb-discover-source-heading">
        {provider.label}{" "}
        <span className="sb-discover-fold-count">
          {items === null ? "…" : items.length}
        </span>
      </h3>
      {items === null && (
        <p className="sb-muted sb-small">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      )}
      {widened && (
        <p className="sb-small sb-muted sb-discover-widened">
          {t("discover-widened", {
            defaultValue:
              "Nothing at the verse you selected. Here is what this chapter has.",
          })}
        </p>
      )}
      {items && byAuthor(items).groups.length > 0 && (
        <ContentCards groups={byAuthor(items).groups} />
      )}
      {items && rest.length > 0 && (
        <SectionedRows items={all || sectioned ? rest : rest.slice(0, FIRST)} />
      )}
      {items && !sectioned && rest.length > FIRST && (
        <button
          type="button"
          className="sb-content-see-all sb-discover-show-all"
          onClick={() => setAll(!all)}
        >
          {all
            ? t("show-fewer", { defaultValue: "Show fewer" })
            : t("show-all-count", {
                count: rest.length,
                defaultValue: "Show all {{count}}",
              })}
        </button>
      )}
    </div>
  );
}

export function DiscoverPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  /** All, or the one source shown alone. */
  const [picked, setPicked] = useState<string>("all");
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const body = useRef<HTMLElement>(null);
  const chapterRef = state.reading.chapterRef.value;
  // Opening Discover reads what was shared afresh: there is no Refresh to find.
  useEffect(() => {
    void state.discover.refresh(chapterRef);
  }, [chapterRef]);
  const providers = state.extensions.providers.value;
  const pick = (id: string) => {
    setPicked(id);
    body.current?.scrollTo({ top: 0 });
  };
  // A source that turns out empty for this chapter has no chip; if it was the one shown, All is shown.
  useEffect(() => {
    if (picked !== "all" && counts[picked] === 0) setPicked("all");
  }, [counts, picked]);
  return (
    <section
      ref={body}
      className="sb-pane sb-discover-pane"
      aria-label={t("discover", { defaultValue: "Discover" })}
    >
      <header className="sb-pane-header">
        <h2 className="sb-discover-title">
          {t("discover-book", {
            book: state.reading.bookName.value,
            defaultValue: "Discover {{book}}",
          })}
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
      <nav
        className="sb-discover-chips"
        aria-label={t("discover-sources", { defaultValue: "What to show" })}
      >
        {[
          { id: "all", label: t("all", { defaultValue: "All" }) },
          ...providers
            .filter((p) => (counts[p.id] ?? 0) > 0)
            .map((p) => ({ id: p.id, label: CHIP[p.id] ?? p.label })),
        ].map((c) => (
          <button
            key={c.id}
            type="button"
            className={`sb-discover-chip${picked === c.id ? " sb-discover-chip--on" : ""}`}
            aria-pressed={picked === c.id}
            onClick={() => pick(c.id)}
          >
            {c.label}
          </button>
        ))}
      </nav>
      {picked === "all" && <ChapterNotes state={state} empty />}
      {providers.map((p) => (
        <ProviderSection
          key={p.id}
          state={state}
          provider={p}
          mode={picked === "all" ? "line" : picked === p.id ? "full" : "hidden"}
          onPick={() => pick(p.id)}
          onCount={(n) =>
            setCounts((m) => (m[p.id] === n ? m : { ...m, [p.id]: n }))
          }
        />
      ))}
    </section>
  );
}
