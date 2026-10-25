// YOUR CONTENT — the old reader's screen (packages/seed-bible components/YourContentPane): everything the reader has
// made in one place — notes, highlights, saves, bookmarks, playlists, reading plans and uploaded pictures — filtered
// by a search over their own things and a row of chips, with + Create beside them. "All" shows the first few of each
// section with See all; every item has its ⋯ menu; a note or a highlight quotes its verse, from any chapter. Dressed
// by the copied `your-content.css`. The Bible itself is searched from the floating search box (Search).
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { noteText } from "./noteHtml";
import { getVersePlainText } from "../reader/chapterContent";
import { listStored, type StoredChapter } from "../../state/records/all";
import { spanOf } from "../../state/records/marks";
import { chapterOf } from "@seed/seed-protocol";
import type {
  Annotation,
  GalleryImage,
  Highlight,
  Playlist,
  ReadingPlan,
} from "@seed/seed-schema";
import { colorIdOf } from "../../state/records/highlights";
import { MenuButton, MenuItem } from "../chrome/ContextMenu";
import type { PlanView } from "../../state/library/plans";
import { sharedPathOf, sharedRefOf } from "../../state/social/sharedPage";
import { openSavePicker } from "./SavePicker";
import { BookmarkForm, BookmarkGlyph } from "./Bookmarks";
import { DEFAULT_BOOKMARK_COLOR_ID } from "../../state/records/bookmarks";

/** How many of each section "All" shows before See all. */
const PREVIEW_LIMIT = 3;

const FILTERS = [
  "all",
  "annotations",
  "highlights",
  "saves",
  "bookmarks",
  "playlists",
  "reading-plans",
  "images",
] as const;
type Filter = (typeof FILTERS)[number];

/** A verse's words, read back from its chapter once per chapter (nothing stores the wording of a mark). */
const chapters = new Map<string, Promise<Map<number, string>>>();
function verseTexts(
  state: ReaderState,
  translationId: string,
  chapter: string
): Promise<Map<number, string>> {
  const key = `${translationId}/${chapter}`;
  let hit = chapters.get(key);
  if (!hit) {
    const [book, ch] = chapter.split(".");
    hit = state.api
      .getTranslationBookChapter(translationId, book!, Number(ch))
      .then((c) => {
        const out = new Map<number, string>();
        for (const e of c.chapter.content)
          if (e && typeof e === "object" && e.type === "verse")
            out.set(e.number, getVersePlainText(e.content));
        return out;
      })
      .catch(() => {
        chapters.delete(key);
        return new Map<number, string>();
      });
    chapters.set(key, hit);
  }
  return hit;
}

function useVerseText(
  state: ReaderState,
  translationId: string,
  chapter: string,
  verse: number
) {
  const [text, setText] = useState("");
  useEffect(() => {
    let live = true;
    void verseTexts(state, translationId, chapter).then(
      (m) => live && setText(m.get(verse) ?? "")
    );
    return () => {
      live = false;
    };
  }, [translationId, chapter, verse]);
  return text;
}

/** A note's verses; none (null) for a note on the whole chapter. */
function noteSpan(passage: string): {
  start: number | null;
  end: number | null;
} {
  return passage === chapterOf(passage)
    ? { start: null, end: null }
    : spanOf(passage);
}

function refLabel(
  state: ReaderState,
  chapter: string,
  start: number | null,
  end: number | null
) {
  const [book, ch] = chapter.split(".");
  const name =
    state.reading.books.value.find((b) => b.id === book)?.name ?? book;
  if (start === null) return `${name} ${ch}`;
  return `${name} ${ch}:${start === end ? start : `${start}-${end}`}`;
}

const dateOf = (iso: string | undefined, language: string, short = false) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(language, {
        month: "short",
        day: "2-digit",
        ...(short ? {} : { year: "numeric" }),
      })
    : "";
};

function SectionHeader(props: { title: string; onSeeAll?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sb-content-section-head">
      <h3 className="sb-content-section-title">{props.title}</h3>
      {props.onSeeAll && (
        <button
          type="button"
          className="sb-content-see-all"
          onClick={props.onSeeAll}
        >
          {t("see-all", { defaultValue: "See all" })}
        </button>
      )}
    </div>
  );
}

function Kebab(props: { label?: string; children: ComponentChildren }) {
  const { t } = useI18n();
  return (
    <MenuButton
      label={props.label ?? t("more-options", { defaultValue: "More options" })}
      icon="more_horiz"
      buttonClassName="sb-content-kebab"
      menuClassName="sb-tab-menu"
    >
      {props.children}
    </MenuButton>
  );
}

function AnnotationCard(props: {
  state: ReaderState;
  chapter: string;
  note: Annotation;
  translationId: string;
  onOpen: () => void;
}) {
  const { state, chapter, note } = props;
  const { t, language } = useI18n();
  const s = noteSpan(note.aboutPassage);
  const text = useVerseText(state, props.translationId, chapter, s.start ?? 0);
  return (
    <div className="sb-content-annotation">
      <div className="sb-content-annotation-head">
        <span className="sb-content-date">
          {dateOf(note.createdAt ?? note.updatedAt, language)}
        </span>
        <Kebab>
          <MenuItem icon="edit" onSelect={props.onOpen}>
            {t("edit", { defaultValue: "Edit" })}
          </MenuItem>
          <MenuItem
            icon="delete"
            className="sb-content-menu-delete"
            onSelect={() => void state.annotations.remove(chapter, note["@id"])}
          >
            {t("delete", { defaultValue: "Delete" })}
          </MenuItem>
        </Kebab>
      </div>
      <button type="button" className="sb-content-quote" onClick={props.onOpen}>
        {text && <span className="sb-content-quote-text">{text}</span>}
        <span className="sb-content-quote-ref">
          {refLabel(state, chapter, s.start, s.end)}
        </span>
      </button>
      <div className="sb-content-annotation-body">
        {noteText(note.note).slice(0, 280)}
      </div>
    </div>
  );
}

function HighlightRow(props: {
  state: ReaderState;
  chapter: string;
  highlight: Highlight;
  translationId: string;
  onOpen: () => void;
}) {
  const { state, chapter, highlight } = props;
  const { t } = useI18n();
  const s = spanOf(highlight.aboutPassage);
  const text = useVerseText(state, props.translationId, chapter, s.start);
  return (
    <div className="sb-content-highlight-row">
      <button
        type="button"
        className="sb-content-highlight"
        style={{
          borderInlineStartColor:
            highlight.customColor ??
            `var(--sb-highlight-${colorIdOf(highlight.highlightColor)}-color, var(--sb-primary-color))`,
        }}
        onClick={props.onOpen}
      >
        {text && <span className="sb-content-highlight-text">{text}</span>}
        <span className="sb-content-highlight-ref">
          {refLabel(state, chapter, s.start, s.end)}
        </span>
      </button>
      <Kebab>
        <MenuItem
          icon="delete"
          className="sb-content-menu-delete"
          onSelect={() => void state.highlights.clear(chapter, s.start, s.end)}
        >
          {t("clear-highlight", { defaultValue: "Clear highlight" })}
        </MenuItem>
      </Kebab>
    </div>
  );
}

/** Where the reader is with a plan, in a few words: Not started, Day 3 of 10 (2/5 sessions self-paced), Completed. */
function planStatus(v: PlanView, t: ReturnType<typeof useI18n>["t"]) {
  if (!v.progress)
    return t("reading-plan-not-started", { defaultValue: "Not started" });
  const sessions = v.plan.hasSession.length;
  const done = v.plan.hasSession.filter((s) => {
    const p = v.progress!.sessions.find((x) => x.session === s["@id"]);
    return p && p.completed.length >= s.readings.length;
  }).length;
  if (sessions > 0 && done === sessions)
    return t("reading-plan-completed", { defaultValue: "Completed" });
  if (v.progress.selfPaced)
    return t("reading-plan-progress-sessions", {
      done,
      total: sessions,
      defaultValue: "{{done}}/{{total}} sessions",
    });
  return t("plan-day-of", {
    day: (v.todayIndex ?? done) + 1,
    total: sessions,
    defaultValue: "Day {{day}} of {{total}}",
  });
}

function WorkRow(props: {
  title: string;
  picture?: string | undefined;
  status?: string;
  onOpen: () => void;
  children: ComponentChildren;
}) {
  return (
    <li
      className="sb-discover-item sb-discover-item--row sb-content-plan"
      dir="auto"
    >
      <button type="button" className="sb-content-work" onClick={props.onOpen}>
        <span className="sb-content-work-thumb" aria-hidden="true">
          {props.picture ? (
            <img src={props.picture} alt="" loading="lazy" />
          ) : (
            <span className="material-symbols-outlined">menu_book</span>
          )}
        </span>
        <span className="sb-discover-item-main">
          <span className="sb-discover-item-title">{props.title}</span>
          {props.status && (
            <span className="sb-content-plan-status">{props.status}</span>
          )}
        </span>
      </button>
      {props.children}
    </li>
  );
}

function Dialog(props: { onClose: () => void; children: ComponentChildren }) {
  return (
    <div
      className="sb-footnote-modal-overlay"
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        props.onClose();
      }}
    >
      <div
        className="sb-footnote-modal sb-content-dialog"
        role="dialog"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {props.children}
      </div>
    </div>
  );
}

export function YourContentPane({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const { reading, saves, bookmarks, playlists, plans, files, ui } = state;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [allHighlights, setAllHighlights] = useState<
    StoredChapter<Highlight>[]
  >([]);
  const [allNotes, setAllNotes] = useState<StoredChapter<Annotation>[]>([]);
  const [words, setWords] = useState<Map<string, string>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState("");
  const [viewing, setViewing] = useState<GalleryImage | null>(null);
  const [deleting, setDeleting] = useState<GalleryImage | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const changed = state.buckets.changed.value;
  const here = reading.translationId.value;

  const load = () => {
    const who = () => state.backend.identity();
    return Promise.all([
      listStored<Highlight>(state.stores, "highlights", "seed:Highlight", who),
      listStored<Annotation>(
        state.stores,
        "annotations",
        "seed:Annotation",
        who
      ),
    ])
      .then(([h, n]) => {
        setAllHighlights(h);
        setAllNotes(n);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  };
  useEffect(() => {
    void load();
  }, [changed]);
  useEffect(() => {
    void playlists.refresh();
    void plans.refresh();
    void files.gallery.refresh();
  }, []);

  const needle = query.trim().toLowerCase();
  // A highlight has no words of its own: searching reads its chapters back, once, on the first search.
  useEffect(() => {
    if (!needle) return;
    let live = true;
    void Promise.all(
      allHighlights.map(async (c) => {
        const m = await verseTexts(
          state,
          c.items[0]?.ofEdition ?? here,
          c.chapterRef
        );
        return c.items.map((h) => {
          const s = spanOf(h.aboutPassage);
          const text: string[] = [];
          for (let v = s.start; v <= s.end; v++) text.push(m.get(v) ?? "");
          return [h["@id"], text.join(" ")] as const;
        });
      })
    ).then((rows) => live && setWords(new Map(rows.flat())));
    return () => {
      live = false;
    };
  }, [needle.length > 0, allHighlights]);

  const matches = (...fields: Array<string | null | undefined>) =>
    !needle || fields.some((f) => f?.toLowerCase().includes(needle));
  const refFields = (
    chapter: string,
    start: number | null,
    end: number | null
  ) => [refLabel(state, chapter, start, end), chapter.split(".")[0]];

  const notes = allNotes
    .flatMap((c) => c.items.map((n) => ({ chapter: c.chapterRef, n })))
    .filter(({ chapter, n }) => {
      const s = noteSpan(n.aboutPassage);
      return matches(noteText(n.note), ...refFields(chapter, s.start, s.end));
    })
    .sort((a, b) =>
      (b.n.createdAt ?? b.n.updatedAt ?? "").localeCompare(
        a.n.createdAt ?? a.n.updatedAt ?? ""
      )
    );
  const highlights = allHighlights
    .flatMap((c) => c.items.map((h) => ({ chapter: c.chapterRef, h })))
    .filter(({ chapter, h }) => {
      const s = spanOf(h.aboutPassage);
      return matches(
        ...refFields(chapter, s.start, s.end),
        words.get(h["@id"])
      );
    });
  const saveList = saves.all.value.filter((s) =>
    matches(s.label, ...s.folders, ...refFields(s.chapter, s.start, s.end))
  );
  const bookmarkList = bookmarks.all.value.filter((b) =>
    matches(b.name, ...refFields(b.chapter, null, null))
  );
  const playlistList = playlists
    .live()
    .filter((p) => matches(p.label, p.description));
  const planList = plans.views.value.filter((v) =>
    matches(v.plan.label, v.plan.description)
  );
  // A picture has no words to search, so any search hides them.
  const images = needle
    ? []
    : files.gallery.live().filter((g) => !g.deleted && state.session.value);

  const counts: Record<Exclude<Filter, "all">, number> = {
    annotations: notes.length,
    highlights: highlights.length,
    saves: saveList.length,
    bookmarks: bookmarkList.length,
    playlists: playlistList.length,
    "reading-plans": planList.length,
    images: images.length,
  };
  const showing = (f: Filter) => filter === "all" || filter === f;
  const limit = <T,>(list: T[]) =>
    filter === "all" ? list.slice(0, PREVIEW_LIMIT) : list;
  const seeAll = (f: Filter, n: number) =>
    filter === "all" && n > PREVIEW_LIMIT ? () => setFilter(f) : undefined;
  const nothing =
    status === "ready" &&
    (filter === "all"
      ? Object.values(counts).every((n) => n === 0)
      : counts[filter] === 0);

  const chipLabel = (f: Filter) =>
    ({
      all: t("all", { defaultValue: "All" }),
      annotations: t("annotations", { defaultValue: "Annotations" }),
      highlights: t("highlights", { defaultValue: "Highlights" }),
      saves: t("saves", { defaultValue: "Saves" }),
      bookmarks: t("bookmarks", { defaultValue: "Bookmarks" }),
      playlists: t("playlists", { defaultValue: "Playlists" }),
      "reading-plans": t("reading-plans", { defaultValue: "Reading plans" }),
      images: t("images", { defaultValue: "Images" }),
    })[f];
  const emptyMessage = () => {
    if (needle)
      return t("your-content-no-matches", {
        defaultValue: "Nothing matches that search.",
      });
    switch (filter) {
      case "annotations":
        return t("your-content-empty-annotations", {
          defaultValue: "Notes you write will show up here.",
        });
      case "highlights":
        return t("your-content-empty-highlights", {
          defaultValue: "Verses you highlight will show up here.",
        });
      case "saves":
        return t("your-content-empty-saves", {
          defaultValue: "Passages you save will show up here.",
        });
      case "bookmarks":
        return t("your-content-empty-bookmarks", {
          defaultValue: "Chapters you bookmark will show up here.",
        });
      case "playlists":
        return t("your-content-empty-playlists", {
          defaultValue: "Playlists you create will show up here.",
        });
      case "reading-plans":
        return t("your-content-empty-reading-plans", {
          defaultValue: "Reading plans you create will show up here.",
        });
      case "images":
        return t("your-images-empty", {
          defaultValue:
            "Images you upload as covers for playlists and reading plans will show up here.",
        });
      default:
        return t("your-content-empty", {
          defaultValue:
            "Notes, highlights, saves, playlists and reading plans you make will show up here.",
        });
    }
  };

  /** A chapter opened at its verses (in the translation a mark was made in), the pane closed to read it. */
  const open = (
    chapter: string,
    start?: number | null,
    end?: number | null,
    translationId?: string
  ) => {
    const [book, ch] = chapter.split(".");
    void reading
      .goTo(translationId || reading.translationId.value, book!, Number(ch))
      .then(() => {
        if (!start) return;
        reading.scrollToVerse.value = start;
        state.selection.select(start, end ?? start);
      });
  };
  const openNote = (chapter: string, n: Annotation) => {
    const s = noteSpan(n.aboutPassage);
    open(chapter, null, null, n.ofEdition);
    ui.pane.value = "notes";
    ui.focusNoteVerse.value = s.start;
  };
  const toLibrary = (tab: "playlists" | "plans", id: string, edit = false) => {
    ui.libraryOpen.value = { tab, id, edit };
    ui.pane.value = "library";
  };
  /** A published work's page: its offering read back from Discover under its first passage, the link copied. */
  const share = async (work: Playlist | ReadingPlan) => {
    const rec = state.publishing.recordOf(work["@id"]);
    if (!rec) {
      toLibrary(
        work["@type"] === "seed:Playlist" ? "playlists" : "plans",
        work["@id"]
      );
      return;
    }
    await state.discover.refresh(rec.passage);
    const o = state.discover
      .forChapter(rec.passage)
      .value?.offerings.find((x) => x.descriptorId === rec.descriptorId);
    const ref = o ? sharedRefOf(o) : null;
    if (!ref) return;
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${sharedPathOf(ref)}`
      );
      ui.toast.value = {
        key:
          work["@type"] === "seed:Playlist"
            ? "playlist-url-copied"
            : "plan-url-copied",
      };
    } catch {
      /* the clipboard refused */
    }
  };
  const coversOf = (url: string) =>
    [...playlists.live(), ...plans.views.value.map((v) => v.plan)]
      .filter((w) => w.heroImage === url)
      .map((w) => w.label);

  return (
    <section
      className="sb-pane sb-content-screen"
      aria-label={t("your-content", { defaultValue: "Your content" })}
    >
      <header className="sb-pane-header">
        <h2>{t("your-content", { defaultValue: "Your content" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      <div className="sb-content-inner">
        <div className="sb-content-search">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={t("search-placeholder", { defaultValue: "Search..." })}
            aria-label={t("search-your-content", {
              defaultValue: "Search your content",
            })}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="sb-content-toolbar">
          <MenuButton
            label={t("create-menu", { defaultValue: "Create" })}
            buttonClassName="sb-content-create"
            menuClassName="sb-tab-menu"
            text={`+ ${t("create-playlist", { defaultValue: "Create" })}`}
          >
            <MenuItem
              icon="queue_music"
              onSelect={() => {
                void playlists
                  .create(
                    t("new-playlist-name", { defaultValue: "New playlist" }),
                    []
                  )
                  .then((p) => toLibrary("playlists", p["@id"]));
              }}
            >
              {t("create-playlist-menu-item", { defaultValue: "Playlist" })}
            </MenuItem>
            <MenuItem
              icon="event_note"
              onSelect={() => {
                void plans
                  .create(t("new-plan-name", { defaultValue: "New plan" }), [
                    { items: [] },
                  ])
                  .then((p) => toLibrary("plans", p["@id"], true));
              }}
            >
              {t("create-plan-menu-item", { defaultValue: "Reading plan" })}
            </MenuItem>
          </MenuButton>
          <div className="sb-content-chips" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className={`sb-content-chip${filter === f ? " sb-content-chip-active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {chipLabel(f)}
              </button>
            ))}
          </div>
        </div>

        {status === "loading" && (
          <p className="sb-content-status sb-content-status--loading">
            {t("loading-your-content", {
              defaultValue: "Gathering your content…",
            })}
          </p>
        )}
        {status === "error" && (
          <div className="sb-content-status">
            <p>
              {t("your-content-load-failed", {
                defaultValue: "Your content couldn't be loaded.",
              })}
            </p>
            <button
              type="button"
              className="sb-content-retry"
              onClick={() => {
                setStatus("loading");
                void load();
              }}
            >
              {t("try-again", { defaultValue: "Try again" })}
            </button>
          </div>
        )}
        {nothing && <p className="sb-content-status">{emptyMessage()}</p>}

        {showing("annotations") && notes.length > 0 && (
          <section className="sb-content-section">
            <SectionHeader
              title={t("annotations", { defaultValue: "Annotations" })}
              onSeeAll={seeAll("annotations", notes.length)}
            />
            <div className="sb-content-annotations">
              {limit(notes).map(({ chapter, n }) => (
                <AnnotationCard
                  key={n["@id"]}
                  state={state}
                  chapter={chapter}
                  note={n}
                  translationId={n.ofEdition ?? here}
                  onOpen={() => openNote(chapter, n)}
                />
              ))}
            </div>
          </section>
        )}

        {showing("highlights") && highlights.length > 0 && (
          <section className="sb-content-section">
            <SectionHeader
              title={t("highlights", { defaultValue: "Highlights" })}
              onSeeAll={seeAll("highlights", highlights.length)}
            />
            <div className="sb-content-highlights">
              {limit(highlights).map(({ chapter, h }) => {
                const s = spanOf(h.aboutPassage);
                return (
                  <HighlightRow
                    key={h["@id"]}
                    state={state}
                    chapter={chapter}
                    highlight={h}
                    translationId={h.ofEdition ?? here}
                    onOpen={() => open(chapter, s.start, s.end, h.ofEdition)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {showing("saves") && saveList.length > 0 && (
          <section className="sb-content-section">
            <SectionHeader
              title={t("saves", { defaultValue: "Saves" })}
              onSeeAll={seeAll("saves", saveList.length)}
            />
            <div className="sb-content-saves">
              {limit(saveList).map((s) => (
                <div key={s.id} className="sb-content-save-row">
                  <button
                    type="button"
                    className="sb-content-save"
                    onClick={() => open(s.chapter, s.start, s.end, s.edition)}
                  >
                    <span className="sb-content-save-name">
                      {s.label ?? refLabel(state, s.chapter, s.start, s.end)}
                    </span>
                    <span
                      className={`sb-content-save-kind${s.start !== null ? " sb-content-save-kind-verse" : ""}`}
                    >
                      {s.start !== null
                        ? t("verse", { defaultValue: "Verse" })
                        : t("chapter", { defaultValue: "Chapter" })}
                    </span>
                    <span className="sb-content-save-date">
                      {s.folders.length
                        ? `${s.folders.join(", ")} · ${dateOf(s.createdAt, language, true)}`
                        : dateOf(s.createdAt, language, true)}
                    </span>
                  </button>
                  <MenuButton
                    label={t("save-options", {
                      defaultValue: "Save options",
                    })}
                    buttonClassName="sb-content-save-menu"
                    menuClassName="sb-tab-menu"
                  >
                    <MenuItem
                      icon="edit"
                      onSelect={() =>
                        openSavePicker(
                          state,
                          s.chapter,
                          s.start !== null
                            ? { start: s.start, end: s.end ?? s.start }
                            : null,
                          s.edition,
                          s.id
                        )
                      }
                    >
                      {t("edit-save", { defaultValue: "Edit save" })}
                    </MenuItem>
                    <MenuItem
                      icon="delete"
                      onSelect={() => void saves.remove(s.id)}
                    >
                      {t("remove-save", { defaultValue: "Remove save" })}
                    </MenuItem>
                  </MenuButton>
                </div>
              ))}
            </div>
          </section>
        )}

        {showing("bookmarks") && bookmarkList.length > 0 && (
          <section className="sb-content-section">
            <SectionHeader
              title={t("bookmarks", { defaultValue: "Bookmarks" })}
              onSeeAll={seeAll("bookmarks", bookmarkList.length)}
            />
            <div className="sb-content-saves">
              {limit(bookmarkList).map((b) =>
                editingId === b.id ? (
                  <form
                    key={b.id}
                    className="sb-item-editor"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void bookmarks.update(b.id, {
                        name: draftName,
                        colorId: draftColor,
                      });
                      setEditingId(null);
                    }}
                  >
                    <BookmarkForm
                      value={{ name: draftName, colorId: draftColor }}
                      autoFocus
                      onChange={(v) => {
                        setDraftName(v.name);
                        setDraftColor(v.colorId);
                      }}
                    />
                    <div className="sb-note-card-actions">
                      <button
                        type="submit"
                        className="sb-note-button sb-note-button-primary"
                      >
                        {t("save", { defaultValue: "Save" })}
                      </button>
                      <button
                        type="button"
                        className="sb-note-button"
                        onClick={() => setEditingId(null)}
                      >
                        {t("cancel", { defaultValue: "Cancel" })}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div key={b.id} className="sb-content-save-row">
                    <button
                      type="button"
                      className="sb-content-save"
                      onClick={() => open(b.chapter)}
                    >
                      <BookmarkGlyph colorId={b.colorId} size={18} />
                      <span className="sb-content-save-name">{b.name}</span>
                      <span className="sb-content-save-date">
                        {dateOf(b.updatedAt, language, true)}
                      </span>
                    </button>
                    <MenuButton
                      label={t("bookmark-options", {
                        defaultValue: "Bookmark options",
                      })}
                      buttonClassName="sb-content-save-menu"
                      menuClassName="sb-tab-menu"
                    >
                      <MenuItem
                        icon="edit"
                        onSelect={() => {
                          setEditingId(b.id);
                          setDraftName(b.name);
                          setDraftColor(b.colorId ?? DEFAULT_BOOKMARK_COLOR_ID);
                        }}
                      >
                        {t("edit-bookmark", { defaultValue: "Edit bookmark" })}
                      </MenuItem>
                      <MenuItem
                        icon="delete"
                        onSelect={() => void bookmarks.remove(b.id)}
                      >
                        {t("remove-bookmark", {
                          defaultValue: "Remove bookmark",
                        })}
                      </MenuItem>
                    </MenuButton>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {showing("playlists") && playlistList.length > 0 && (
          <section className="sb-content-section">
            <SectionHeader
              title={t("playlists", { defaultValue: "Playlists" })}
              onSeeAll={seeAll("playlists", playlistList.length)}
            />
            <ul className="sb-discover-list">
              {limit(playlistList).map((p) => (
                <WorkRow
                  key={p["@id"]}
                  title={p.label}
                  picture={p.heroImage}
                  status={t("n-items", {
                    count: p.hasItem.length,
                    defaultValue: `${p.hasItem.length} items`,
                  })}
                  onOpen={() => toLibrary("playlists", p["@id"])}
                >
                  <Kebab>
                    <MenuItem
                      icon="play_arrow"
                      onSelect={() => playlists.play(p["@id"])}
                    >
                      {t("play-playlist", { defaultValue: "Play playlist" })}
                    </MenuItem>
                    <MenuItem
                      icon="edit"
                      onSelect={() => toLibrary("playlists", p["@id"])}
                    >
                      {t("edit", { defaultValue: "Edit" })}
                    </MenuItem>
                    <MenuItem icon="share" onSelect={() => void share(p)}>
                      {state.publishing.isPublished(p["@id"])
                        ? t("share-playlist", {
                            defaultValue: "Share playlist",
                          })
                        : t("publish-to-share", {
                            defaultValue: "Publish to share",
                          })}
                    </MenuItem>
                    <MenuItem
                      icon="delete"
                      className="sb-content-menu-delete"
                      onSelect={() => void playlists.remove(p["@id"])}
                    >
                      {t("delete", { defaultValue: "Delete" })}
                    </MenuItem>
                  </Kebab>
                </WorkRow>
              ))}
            </ul>
          </section>
        )}

        {showing("reading-plans") && planList.length > 0 && (
          <section className="sb-content-section">
            <SectionHeader
              title={t("reading-plans", { defaultValue: "Reading plans" })}
              onSeeAll={seeAll("reading-plans", planList.length)}
            />
            <ul className="sb-discover-list">
              {limit(planList).map((v) => (
                <WorkRow
                  key={v.plan["@id"]}
                  title={
                    v.plan.label ||
                    t("untitled-reading-plan", {
                      defaultValue: "Untitled plan",
                    })
                  }
                  picture={v.plan.heroImage}
                  status={planStatus(v, t)}
                  onOpen={() => toLibrary("plans", v.plan["@id"])}
                >
                  <Kebab>
                    <MenuItem
                      icon="edit"
                      onSelect={() => toLibrary("plans", v.plan["@id"], true)}
                    >
                      {t("edit", { defaultValue: "Edit" })}
                    </MenuItem>
                    <MenuItem icon="share" onSelect={() => void share(v.plan)}>
                      {state.publishing.isPublished(v.plan["@id"])
                        ? t("share-plan", { defaultValue: "Share plan" })
                        : t("publish-to-share", {
                            defaultValue: "Publish to share",
                          })}
                    </MenuItem>
                    <MenuItem
                      icon="delete"
                      className="sb-content-menu-delete"
                      onSelect={() => void plans.remove(v.plan["@id"])}
                    >
                      {t("delete", { defaultValue: "Delete" })}
                    </MenuItem>
                  </Kebab>
                </WorkRow>
              ))}
            </ul>
          </section>
        )}

        {showing("images") && images.length > 0 && (
          <section className="sb-content-section">
            <SectionHeader
              title={t("images", { defaultValue: "Images" })}
              onSeeAll={seeAll("images", images.length)}
            />
            <ul className="sb-images-grid">
              {limit(images).map((g) => (
                <li key={g["@id"]} className="sb-images-item">
                  <button
                    type="button"
                    className="sb-images-tile"
                    aria-label={t("view-image", { defaultValue: "View image" })}
                    onClick={() => setViewing(g)}
                  >
                    <img src={g.url} alt="" loading="lazy" />
                  </button>
                  <button
                    type="button"
                    className="sb-images-delete"
                    aria-label={t("delete-image", {
                      defaultValue: "Delete image",
                    })}
                    title={t("delete-image", { defaultValue: "Delete image" })}
                    onClick={() => setDeleting(g)}
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                  <span className="sb-images-date">
                    {dateOf(g.createdAt, language)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {viewing && (
        <Dialog onClose={() => setViewing(null)}>
          <div className="sb-images-preview">
            <img className="sb-images-preview-img" src={viewing.url} alt="" />
            <div className="sb-confirm-delete-actions">
              <button
                type="button"
                className="sb-note-button"
                onClick={() => setViewing(null)}
              >
                {t("close", { defaultValue: "Close" })}
              </button>
              <button
                type="button"
                className="sb-note-button sb-note-button-danger"
                onClick={() => {
                  setDeleting(viewing);
                  setViewing(null);
                }}
              >
                {t("delete", { defaultValue: "Delete" })}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {deleting && (
        <Dialog onClose={() => setDeleting(null)}>
          <div className="sb-confirm-delete">
            <img
              className="sb-images-confirm-thumb"
              src={deleting.url}
              alt=""
            />
            <p className="sb-confirm-delete-message">
              {t("delete-image-confirm-message", {
                defaultValue: "Delete this image? This can't be undone.",
              })}
            </p>
            {coversOf(deleting.url).length > 0 && (
              <>
                <p className="sb-confirm-delete-message">
                  {t("delete-image-used-by", {
                    defaultValue: "It's currently the cover of:",
                  })}
                </p>
                <ul className="sb-images-usage-list">
                  {coversOf(deleting.url).map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="sb-confirm-delete-actions">
              <button
                type="button"
                className="sb-note-button"
                onClick={() => setDeleting(null)}
              >
                {t("cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                className="sb-note-button sb-note-button-danger"
                onClick={() => {
                  void files.gallery.remove(deleting["@id"]);
                  setDeleting(null);
                }}
              >
                {t("delete", { defaultValue: "Delete" })}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
