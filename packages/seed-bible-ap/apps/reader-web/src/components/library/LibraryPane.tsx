// THE LIBRARY PANE — playlists and reading plans: the lists, a maker for each from the chapter on screen, the
// player (walks the reader through a playlist's items), a plan's sessions with their readings to tick, and
// Publish for each. Dressed by the copied `playlists.css` / `plans.css` where the classes match.

import { sharedLinkOf } from "../../state/social/sharedPage";
import { ThemeLivePreview } from "../chrome/ThemePreview";
import { PictureField } from "./PictureField";
import { COVER_IMAGE, LOGO } from "../../state/library/crop";
import { PlanEditor } from "./PlanEditor";
import { PlanCard } from "./PlanCard";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { PlaylistItem } from "@seed/seed-schema";
import { spanOf } from "../../state/records/marks";
import { noteText, sanitizeNoteHtml } from "../records/noteHtml";
import { NoteEditor, bodyHtml } from "../records/NotesPane";
import {
  dayKind,
  groupPlayHistoryByDay,
  isComplete,
  percentOf,
} from "../../state/library/playHistory";
import { passageOf } from "../../state/records/marks";
import {
  EDITABLE_TEXT_VARIABLES,
  EDITABLE_VARIABLES,
  themeFromVariant,
} from "../../state/chrome/customizations";
import type { LinkPreview } from "../../backend/ReaderBackend";

/** The chapter a passage ends in when it runs on past its first ("JHN.3.16-JHN.4.2" → "4"), else null. */
function endChapterOf(passage: string): string | null {
  const [from, to] = passage.split("-");
  const a = (from ?? "").split(".")[1];
  const b = (to ?? "").split(".")[1];
  return to && b && b !== a ? b : null;
}

export function itemLabel(state: ReaderState, it: PlaylistItem): string {
  if (it["@type"] === "seed:ScriptureItem") {
    const { chapter, start, end } = spanOf(it.aboutPassage);
    const [book, ch] = chapter.split(".");
    const name =
      state.reading.books.value.find((b) => b.id === book)?.name ?? book;
    const endChapter = endChapterOf(it.aboutPassage);
    const verses = endChapter
      ? `:${start}–${endChapter}:${end}`
      : it.aboutPassage.split(".").length > 2
        ? `:${start}${end !== start ? `–${end}` : ""}`
        : "";
    return `${name} ${ch}${verses}${it.ofEdition ? ` · ${it.ofEdition}` : ""}`;
  }
  if (it["@type"] === "seed:HtmlItem") return it.label ?? "Note";
  return it.label ?? it.url;
}

export function openItem(state: ReaderState, it: PlaylistItem) {
  if (it["@type"] !== "seed:ScriptureItem") return;
  const { chapter, start, end } = spanOf(it.aboutPassage);
  const [book, ch] = chapter.split(".");
  const verses = it.aboutPassage.split(".").length > 2;
  // A passage that runs into the next chapter opens at its start, selected to the end of that chapter.
  const runsOn = !!endChapterOf(it.aboutPassage);
  void state.reading
    .goTo(it.ofEdition ?? state.reading.translationId.value, book!, Number(ch))
    .then(() => {
      if (!verses) return;
      const last = Math.max(
        start,
        ...(state.reading.chapterData.value?.chapter.content ?? []).map((c) =>
          c.type === "verse" ? c.number : 0
        )
      );
      state.selection.select(start, runsOn ? last : end);
    });
}

/** A link's embed form: YouTube and Vimeo become their players; anything else is framed as it is. */
export function embedUrlOf(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be")
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      const m = /^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
      if (m) return `https://www.youtube.com/embed/${m[2]}`;
    }
    if (host === "vimeo.com") {
      const id = /^\/(\d+)/.exec(u.pathname)?.[1];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return u.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** One playlist item, rewritten in place: a passage's note, a note's text and title, a link's label and embed. */
function ItemEditor({
  item,
  onSave,
  onCancel,
}: {
  item: PlaylistItem;
  onSave: (next: PlaylistItem) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState(
    item["@type"] === "seed:ScriptureItem"
      ? (item.noteTitle ?? "")
      : (item.label ?? "")
  );
  const [embed, setEmbed] = useState(
    item["@type"] === "seed:LinkItem" ? item.embed === true : false
  );
  const labelInput = (
    <input
      className="sb-note-editor"
      placeholder={t("playlist-item-title-placeholder", {
        defaultValue: "Title (optional)",
      })}
      value={label}
      onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
    />
  );
  // A passage's note is rich text with a title, as the old reader's ScriptureNote.
  if (item["@type"] === "seed:ScriptureItem")
    return (
      <div className="sb-item-editor">
        {labelInput}
        <NoteEditor
          initial={item.note ? bodyHtml(item.note) : ""}
          saveLabel={t("playlist-save-item", { defaultValue: "Save item" })}
          cancelLabel={t("cancel", { defaultValue: "Cancel" })}
          onCancel={onCancel}
          onSave={(html) => {
            const { note: _n, noteTitle: _t, ...rest } = item;
            onSave({
              ...rest,
              ...(label.trim() ? { noteTitle: label.trim() } : {}),
              ...(noteText(html).trim() ? { note: html } : {}),
            });
          }}
        />
      </div>
    );
  if (item["@type"] === "seed:HtmlItem")
    return (
      <div className="sb-item-editor">
        {labelInput}
        <NoteEditor
          initial={item.html}
          saveLabel={t("playlist-save-item", { defaultValue: "Save item" })}
          cancelLabel={t("cancel", { defaultValue: "Cancel" })}
          onCancel={onCancel}
          onSave={(html) =>
            onSave({
              ...item,
              html,
              ...(label.trim() ? { label: label.trim() } : {}),
            })
          }
        />
      </div>
    );
  return (
    <form
      className="sb-item-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...item,
          ...(label.trim() ? { label: label.trim() } : {}),
          embed,
        });
      }}
    >
      {labelInput}
      {
        <label className="sb-small sb-check">
          <input
            type="checkbox"
            checked={embed}
            onChange={(e) => setEmbed((e.target as HTMLInputElement).checked)}
          />{" "}
          {t("playlist-add-link-embed", {
            defaultValue: "Show the page itself (video players embed)",
          })}
        </label>
      }
      <div className="sb-note-card-actions">
        <button type="submit" className="sb-note-button sb-note-button-primary">
          {t("playlist-save-item", { defaultValue: "Save item" })}
        </button>
        <button type="button" className="sb-note-button" onClick={onCancel}>
          {t("cancel", { defaultValue: "Cancel" })}
        </button>
      </div>
    </form>
  );
}

function LinkCard({
  state,
  url,
  label,
}: {
  state: ReaderState;
  url: string;
  label?: string;
}) {
  const [p, setP] = useState<LinkPreview | null>(null);
  useEffect(() => {
    let live = true;
    void state.files
      .preview(url)
      .then((x) => live && setP(x))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <a className="sb-link-card" href={url} target="_blank" rel="noreferrer">
      {p?.image && <img className="sb-link-card-image" src={p.image} alt="" />}
      <span className="sb-link-card-text">
        <span className="sb-link-card-title">{p?.title ?? label ?? url}</span>
        {p?.description && (
          <span className="sb-link-card-description">{p.description}</span>
        )}
        <span className="sb-link-card-site">
          {p?.siteName ?? new URL(url).hostname}
        </span>
      </span>
    </a>
  );
}

/** What a playing item shows: a passage's own note, a note, or a link (embedded where it can be). */
export function PlayingItem({
  state,
  item: it,
}: {
  state: ReaderState;
  item: PlaylistItem;
}) {
  return (
    <>
      {it["@type"] === "seed:ScriptureItem" && (
        <>
          <p className="sb-small">
            <strong>{itemLabel(state, it)}</strong>
          </p>
          {it.noteTitle && (
            <p className="sb-small sb-playlist-note-title">{it.noteTitle}</p>
          )}
          {it.note && (
            <div
              className="sb-note-card-body sb-small"
              dangerouslySetInnerHTML={{ __html: bodyHtml(it.note) }}
            />
          )}
        </>
      )}
      {it["@type"] === "seed:HtmlItem" && (
        <div
          className="sb-note-card-body"
          dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(it.html) }}
        />
      )}
      {it["@type"] === "seed:LinkItem" &&
        (it.embed && embedUrlOf(it.url) ? (
          <iframe
            className="sb-link-embed"
            src={embedUrlOf(it.url)!}
            title={it.label ?? it.url}
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            allowFullScreen
          />
        ) : (
          <LinkCard state={state} url={it.url} label={it.label} />
        ))}
    </>
  );
}

function Player({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const c = state.playlists.current.value;
  if (!c) return null;
  const it = c.item;
  return (
    <div className="sb-play-playlist sb-account-card">
      <div className="sb-play-playlist-about">
        <strong>{c.playlist.label}</strong>
        <span className="sb-muted sb-small">
          {" "}
          {c.index + 1} / {c.count}
        </span>
      </div>
      <div className="sb-play-playlist-body">
        <PlayingItem state={state} item={it} />
      </div>
      <div className="sb-play-controls sb-note-card-actions">
        <button
          className="sb-note-button"
          disabled={c.index === 0}
          onClick={() => state.playlists.prev()}
        >
          {t("previous", { defaultValue: "Previous" })}
        </button>
        <button
          className="sb-note-button sb-note-button-primary"
          disabled={c.index + 1 >= c.count}
          onClick={() => state.playlists.next()}
        >
          {t("next", { defaultValue: "Next" })}
        </button>
        <button
          className="sb-note-button"
          onClick={() => state.playlists.stop()}
        >
          {t("stop", { defaultValue: "Stop" })}
        </button>
      </div>
    </div>
  );
}

/** The playlists played on this device: one row each, by day, with how far through and Resume (the old PlaylistHistoryPane). */
function PlayHistory({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const { playlists } = state;
  const groups = groupPlayHistoryByDay(playlists.history.value);
  if (!groups.length) return null;
  const dayLabel = (day: string) => {
    const k = dayKind(day);
    if (k === "today") return t("today", { defaultValue: "Today" });
    if (k === "yesterday") return t("yesterday", { defaultValue: "Yesterday" });
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y!, m! - 1, d!).toLocaleDateString(language, {
      dateStyle: "medium",
    });
  };
  return (
    <section className="sb-play-history">
      <header className="sb-play-history-header">
        <h3>
          {t("my-playlist-history", { defaultValue: "My playlist history" })}
        </h3>
        <button
          type="button"
          className="sb-note-button"
          onClick={() => playlists.clearHistory()}
        >
          {t("clear-history", { defaultValue: "Clear" })}
        </button>
      </header>
      {groups.map((g) => (
        <div key={g.day} className="sb-play-history-day">
          <h4 className="sb-small sb-muted">{dayLabel(g.day)}</h4>
          <ul>
            {g.entries.map((e) => {
              const exists = !!playlists.byId(e.playlistId);
              return (
                <li key={e.playlistId} className="sb-play-history-row">
                  <span className="sb-play-history-title">{e.title}</span>
                  <span className="sb-small sb-muted">
                    {isComplete(e)
                      ? t("playlist-history-finished", {
                          defaultValue: "Finished",
                        })
                      : t("playlist-history-step", {
                          step: e.currentStep + 1,
                          total: e.totalSteps,
                          percent: percentOf(e),
                          defaultValue:
                            "Step {{step}} of {{total}} ({{percent}}%)",
                        })}
                    {e.lastItem ? ` · ${e.lastItem}` : ""}
                  </span>
                  <button
                    type="button"
                    className="sb-note-button"
                    disabled={!exists}
                    title={
                      exists
                        ? undefined
                        : t("playlist-history-open-failed", {
                            defaultValue:
                              "This playlist is no longer in your Library.",
                          })
                    }
                    onClick={() =>
                      playlists.play(
                        e.playlistId,
                        isComplete(e) ? 0 : e.currentStep
                      )
                    }
                  >
                    {isComplete(e)
                      ? t("play-again", { defaultValue: "Play again" })
                      : t("resume", { defaultValue: "Resume" })}
                  </button>
                  <button
                    type="button"
                    className="sb-content-kebab"
                    aria-label={t("playlist-history-remove", {
                      defaultValue: "Remove from history",
                    })}
                    title={t("playlist-history-remove", {
                      defaultValue: "Remove from history",
                    })}
                    onClick={() => playlists.removeHistory(e.playlistId)}
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function LibraryPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { playlists, plans, reading } = state;
  const [tab, setTab] = useState<"playlists" | "plans" | "customizations">(
    "playlists"
  );
  const [variantName, setVariantName] = useState("");
  const [variantScheme, setVariantScheme] = useState<"light" | "dark">("light");
  const [variableDrafts, setVariableDrafts] = useState<Record<string, string>>(
    {}
  );
  const [open, setOpen] = useState<string | null>(null);
  /** The playlist whose title and description are being edited. */
  const [renaming, setRenaming] = useState<{
    id: string;
    label: string;
    description: string;
  } | null>(null);
  /** The playlist asked about before it is deleted. */
  const [deleting, setDeleting] = useState<{
    id: string;
    label: string;
    kind?: "plan";
  } | null>(null);
  const [title, setTitle] = useState("");
  const [planTo, setPlanTo] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const canPublish = !!state.session.value?.wire;
  /** `${playlistId}:${index}` of the item being edited, "note:${playlistId}" for a new note. */
  const [editing, setEditing] = useState<string | null>(null);
  const [refText, setRefText] = useState("");
  /** A published playlist's link: the device's share sheet, else the clipboard ("Playlist URL copied"). */
  const sharePlaylist = async (pl: { "@id": string; label: string }) => {
    const url = await sharedLinkOf(
      state.publishing,
      state.discover,
      pl["@id"],
      location.origin
    );
    if (!url) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: pl.label, url });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      state.ui.toast.value = { key: "playlist-url-copied" };
    } catch {
      /* the clipboard refused */
    }
  };
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  /** The old reader's messages for a reference or a link that will not do. */
  const [inputError, setInputError] = useState<"reference" | "url" | null>(
    null
  );
  // The open playlist is the one the verse toolbar's Add to Playlist adds to, while this pane shows it.
  useEffect(() => {
    state.ui.editingPlaylist.value = tab === "playlists" ? open : null;
    return () => (state.ui.editingPlaylist.value = null);
  }, [tab, open]);
  /** The plan open in the editor, or null. */
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  // A playlist or plan handed over to open here (Your content's Edit and Open).
  const handed = state.ui.libraryOpen.value;
  useEffect(() => {
    if (!handed) return;
    setTab(handed.tab);
    setOpen(handed.id);
    setEditingPlan(handed.tab === "plans" && handed.edit ? handed.id : null);
    state.ui.libraryOpen.value = null;
  }, [handed]);
  /** A typed reference ("John 3:16-18") as a scripture item in the open translation. */
  const scriptureFromText = (text: string): PlaylistItem | null => {
    const r = state.search.parseReference(text.trim(), reading.books.value);
    // The parser passes an unknown book name through as typed ("Nowhere 99"); only this Bible's books are readings.
    if (!r || !reading.books.value.some((b) => b.id === r.book)) return null;
    const chapter = `${r.book}.${r.chapter}`;
    const passage = !r.verse
      ? chapter
      : r.endChapter && r.endChapter !== r.chapter
        ? `${chapter}.${r.verse}-${r.book}.${r.endChapter}.${r.endVerse ?? 1}`
        : passageOf(chapter, r.verse, r.endVerse ?? r.verse);
    return {
      "@type": "seed:ScriptureItem",
      aboutPassage: passage,
      ofEdition: reading.translationId.value,
    };
  };
  const [copied, setCopied] = useState<string | null>(null);
  const currentPassage = () => {
    const v = state.selection.verses.value;
    const chapter = reading.chapterRef.value;
    return v.length
      ? `${chapter}.${Math.min(...v)}${v.length > 1 ? `-${chapter}.${Math.max(...v)}` : ""}`
      : chapter;
  };
  const scriptureItem = (): PlaylistItem => ({
    "@type": "seed:ScriptureItem",
    aboutPassage: currentPassage(),
    ofEdition: reading.translationId.value,
  });

  return (
    <section
      className="sb-pane sb-library-pane"
      aria-label={t("library", { defaultValue: "Library" })}
    >
      <header className="sb-pane-header">
        <div className="sb-selector-pane-picker" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "playlists"}
            className={`sb-selector-pane-chip${tab === "playlists" ? " sb-selector-pane-chip-selected" : ""}`}
            onClick={() => setTab("playlists")}
          >
            {t("playlists", { defaultValue: "Playlists" })}
          </button>
          <button
            role="tab"
            aria-selected={tab === "plans"}
            className={`sb-selector-pane-chip${tab === "plans" ? " sb-selector-pane-chip-selected" : ""}`}
            onClick={() => setTab("plans")}
          >
            {t("reading-plans", { defaultValue: "Reading plans" })}
          </button>
          <button
            role="tab"
            aria-selected={tab === "customizations"}
            className={`sb-selector-pane-chip${tab === "customizations" ? " sb-selector-pane-chip-selected" : ""}`}
            onClick={() => setTab("customizations")}
          >
            {t("customizations", { defaultValue: "Customizations" })}
          </button>
        </div>
        <div>
          <button
            className="sb-pane-close"
            aria-label={t("refresh", { defaultValue: "Refresh" })}
            onClick={() =>
              void (tab === "playlists" ? playlists.refresh() : plans.refresh())
            }
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
      {(playlists.error.value ||
        plans.error.value ||
        state.publishing.error.value) && (
        <p className="sb-pane-error">
          {playlists.error.value ??
            plans.error.value ??
            state.publishing.error.value}
        </p>
      )}

      {tab === "playlists" && (
        <>
          <Player state={state} />
          <form
            className="sb-account-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void playlists
                .create(title.trim(), [scriptureItem()])
                .then((p) => setOpen(p["@id"]));
              setTitle("");
            }}
          >
            <input
              className="sb-note-editor"
              placeholder={t("new-playlist-title", {
                defaultValue:
                  "New playlist, starting with the passage on screen",
              })}
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
            <div className="sb-note-card-actions">
              <button
                type="submit"
                className="sb-note-button sb-note-button-primary"
                disabled={!title.trim()}
              >
                {t("create-playlist", { defaultValue: "Create" })}
              </button>
            </div>
          </form>
          {!playlists.live().length && (
            <p className="sb-pane-empty">
              {t("playlists-empty", { defaultValue: "No playlists yet." })}
            </p>
          )}
          {playlists.live().map((pl) => {
            const isOpen = open === pl["@id"];
            const published = state.publishing.isPublished(pl["@id"]);
            return (
              <article key={pl["@id"]} className="sb-note-card">
                <header className="sb-note-card-header">
                  <button
                    className="sb-note-card-ref"
                    onClick={() => setOpen(isOpen ? null : pl["@id"])}
                  >
                    {pl.label}
                  </button>
                  <span className="sb-note-card-when">
                    {pl.hasItem.length} {t("items", { defaultValue: "items" })}
                  </span>
                </header>
                {isOpen && (
                  <>
                    {renaming?.id === pl["@id"] ? (
                      <form
                        className="sb-item-editor"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!renaming.label.trim()) return;
                          void playlists.update(pl["@id"], {
                            label: renaming.label.trim(),
                            description: renaming.description.trim(),
                          });
                          setRenaming(null);
                        }}
                      >
                        <input
                          className="sb-note-editor"
                          aria-label={t("playlist-title", {
                            defaultValue: "Title",
                          })}
                          placeholder={t("playlist-title", {
                            defaultValue: "Title",
                          })}
                          value={renaming.label}
                          onInput={(e) =>
                            setRenaming({
                              ...renaming,
                              label: (e.target as HTMLInputElement).value,
                            })
                          }
                        />
                        <textarea
                          className="sb-note-editor"
                          rows={3}
                          aria-label={t("playlist-description", {
                            defaultValue: "Description",
                          })}
                          placeholder={t("playlist-description", {
                            defaultValue: "Description",
                          })}
                          value={renaming.description}
                          onInput={(e) =>
                            setRenaming({
                              ...renaming,
                              description: (e.target as HTMLTextAreaElement)
                                .value,
                            })
                          }
                        />
                        <div className="sb-note-card-actions">
                          <button
                            type="submit"
                            className="sb-note-button sb-note-button-primary"
                            disabled={!renaming.label.trim()}
                          >
                            {t("save", { defaultValue: "Save" })}
                          </button>
                          <button
                            type="button"
                            className="sb-note-button"
                            onClick={() => setRenaming(null)}
                          >
                            {t("cancel", { defaultValue: "Cancel" })}
                          </button>
                        </div>
                      </form>
                    ) : (
                      pl.description && (
                        <p className="sb-small sb-playlist-description">
                          {pl.description}
                        </p>
                      )
                    )}
                    <ol className="sb-library-items">
                      {pl.hasItem.map((it, i) => (
                        <li
                          key={i}
                          className={`sb-library-item${dragOver === i ? " sb-library-item-drop" : ""}`}
                          // Dragged into place, as in the old reader; the arrows stay for the keyboard.
                          draggable={editing !== `${pl["@id"]}:${i}`}
                          onDragStart={(e: DragEvent) => {
                            dragFrom.current = i;
                            e.dataTransfer?.setData("text/plain", String(i));
                            if (e.dataTransfer)
                              e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e: DragEvent) => {
                            if (dragFrom.current === null) return;
                            e.preventDefault();
                            if (dragOver !== i) setDragOver(i);
                          }}
                          onDragLeave={() =>
                            setDragOver((d) => (d === i ? null : d))
                          }
                          onDrop={(e: DragEvent) => {
                            e.preventDefault();
                            const from = dragFrom.current;
                            dragFrom.current = null;
                            setDragOver(null);
                            if (from !== null && from !== i)
                              void playlists.moveItem(pl["@id"], from, i);
                          }}
                          onDragEnd={() => {
                            dragFrom.current = null;
                            setDragOver(null);
                          }}
                        >
                          {editing === `${pl["@id"]}:${i}` ? (
                            <ItemEditor
                              item={it}
                              onCancel={() => setEditing(null)}
                              onSave={(next) => {
                                void playlists.updateItem(pl["@id"], i, next);
                                setEditing(null);
                              }}
                            />
                          ) : (
                            <button
                              className="sb-note-card-ref"
                              onClick={() => openItem(state, it)}
                            >
                              <span className="material-symbols-outlined sb-item-icon">
                                {it["@type"] === "seed:ScriptureItem"
                                  ? "menu_book"
                                  : it["@type"] === "seed:HtmlItem"
                                    ? "sticky_note_2"
                                    : "link"}
                              </span>
                              {itemLabel(state, it)}
                            </button>
                          )}
                          <span>
                            <button
                              className="sb-content-kebab"
                              aria-label={t("playlist-edit-item", {
                                defaultValue: "Edit item",
                              })}
                              onClick={() =>
                                setEditing(
                                  editing === `${pl["@id"]}:${i}`
                                    ? null
                                    : `${pl["@id"]}:${i}`
                                )
                              }
                            >
                              <span className="material-symbols-outlined">
                                edit
                              </span>
                            </button>
                            <button
                              className="sb-content-kebab"
                              aria-label={t("move-up", {
                                defaultValue: "Move up",
                              })}
                              disabled={i === 0}
                              onClick={() =>
                                void playlists.moveItem(pl["@id"], i, i - 1)
                              }
                            >
                              <span className="material-symbols-outlined">
                                arrow_upward
                              </span>
                            </button>
                            <button
                              className="sb-content-kebab"
                              aria-label={t("move-down", {
                                defaultValue: "Move down",
                              })}
                              disabled={i === pl.hasItem.length - 1}
                              onClick={() =>
                                void playlists.moveItem(pl["@id"], i, i + 1)
                              }
                            >
                              <span className="material-symbols-outlined">
                                arrow_downward
                              </span>
                            </button>
                            <button
                              className="sb-content-kebab"
                              aria-label={t("remove-playlist-item", {
                                defaultValue: "Remove item",
                              })}
                              onClick={() =>
                                void playlists.removeItem(pl["@id"], i)
                              }
                            >
                              <span className="material-symbols-outlined">
                                close
                              </span>
                            </button>
                          </span>
                        </li>
                      ))}
                    </ol>
                    {pl.heroImage && (
                      <div className="sb-playlist-hero-row">
                        <img
                          className="sb-hero-thumb sb-playlist-hero"
                          src={pl.heroImage}
                          alt=""
                        />
                        <button
                          type="button"
                          className="sb-note-button"
                          onClick={() =>
                            void playlists.update(pl["@id"], {
                              heroImage: undefined,
                            })
                          }
                        >
                          {t("remove-cover", { defaultValue: "Remove cover" })}
                        </button>
                      </div>
                    )}
                    <div className="sb-note-card-actions">
                      <PictureField
                        state={state}
                        target={COVER_IMAGE}
                        label={t("cover-image", {
                          defaultValue: "Cover image",
                        })}
                        cropTitle={t("crop-cover", {
                          defaultValue: "Crop the cover image",
                        })}
                        disabled={!state.session.value}
                        onPicked={(url) =>
                          playlists.update(pl["@id"], { heroImage: url })
                        }
                      />
                      {editing === `note:${pl["@id"]}` ? (
                        <div className="sb-item-editor">
                          <NoteEditor
                            saveLabel={t("playlist-add-item", {
                              defaultValue: "Add to playlist",
                            })}
                            cancelLabel={t("cancel", {
                              defaultValue: "Cancel",
                            })}
                            onCancel={() => setEditing(null)}
                            onSave={(html) => {
                              const first = noteText(html)
                                .split("\n")[0]
                                ?.trim()
                                .slice(0, 80);
                              void playlists.addItem(pl["@id"], {
                                "@type": "seed:HtmlItem",
                                html,
                                ...(first ? { label: first } : {}),
                              });
                              setEditing(null);
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          className="sb-note-button"
                          onClick={() => setEditing(`note:${pl["@id"]}`)}
                        >
                          {t("playlist-scripture-note-add", {
                            defaultValue: "Add a note",
                          })}
                        </button>
                      )}
                      <form
                        className="sb-inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const item = scriptureFromText(refText);
                          if (!item) {
                            setInputError("reference");
                            return;
                          }
                          setInputError(null);
                          void playlists.addItem(pl["@id"], item);
                          setRefText("");
                        }}
                      >
                        <input
                          className="sb-note-editor"
                          placeholder={t("playlist-add-scripture-placeholder", {
                            defaultValue:
                              "Add a passage by reference (John 3:16-18)",
                          })}
                          value={refText}
                          onInput={(e) =>
                            setRefText((e.target as HTMLInputElement).value)
                          }
                        />
                        <button
                          type="submit"
                          className="sb-note-button"
                          disabled={!refText.trim()}
                        >
                          {t("playlist-add-button", { defaultValue: "Add" })}
                        </button>
                      </form>
                      {inputError === "reference" && (
                        <p className="sb-pane-error" role="alert">
                          {t("playlist-reference-not-found", {
                            defaultValue: "Couldn't find that reference",
                          })}
                        </p>
                      )}
                      <form
                        className="sb-inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const u = linkUrl.trim();
                          if (!/^https?:\/\/\S+\.\S+/.test(u)) {
                            setInputError("url");
                            return;
                          }
                          setInputError(null);
                          void state.files
                            .preview(u)
                            .catch(() => ({ url: u }) as LinkPreview)
                            .then((p) =>
                              playlists.addItem(pl["@id"], {
                                "@type": "seed:LinkItem",
                                url: u,
                                ...(p.title ? { label: p.title } : {}),
                              })
                            );
                          setLinkUrl("");
                        }}
                      >
                        <input
                          className="sb-note-editor"
                          placeholder={t("add-link-url", {
                            defaultValue: "Add a link (https://…)",
                          })}
                          value={linkUrl}
                          onInput={(e) =>
                            setLinkUrl((e.target as HTMLInputElement).value)
                          }
                        />
                        <button
                          type="submit"
                          className="sb-note-button"
                          disabled={!linkUrl.trim()}
                        >
                          {t("add-link", { defaultValue: "Add link" })}
                        </button>
                      </form>
                      {inputError === "url" && (
                        <p className="sb-pane-error" role="alert">
                          {t("playlist-invalid-url", {
                            defaultValue: "Enter a valid URL",
                          })}
                        </p>
                      )}
                    </div>
                    <div className="sb-note-card-actions">
                      <button
                        className="sb-note-button sb-note-button-primary"
                        onClick={() => playlists.play(pl["@id"])}
                      >
                        {t("play-playlist", { defaultValue: "Play playlist" })}
                      </button>
                      <button
                        className="sb-note-button"
                        onClick={() =>
                          void playlists.addItem(pl["@id"], scriptureItem())
                        }
                      >
                        {t("add-passage-on-screen", {
                          defaultValue: "Add the passage on screen",
                        })}
                      </button>
                      {canPublish && (
                        <button
                          className={`sb-note-button${published ? " sb-note-button-published" : ""}`}
                          disabled={state.publishing.busy.value === pl["@id"]}
                          onClick={() =>
                            void (
                              published
                                ? state.publishing.withdrawWork(
                                    pl["@id"],
                                    "playlist"
                                  )
                                : state.publishing.publishWork(pl)
                            ).catch(() => {})
                          }
                        >
                          {published
                            ? t("published", { defaultValue: "Published" })
                            : t("publish", { defaultValue: "Publish" })}
                        </button>
                      )}
                      {published && (
                        <button
                          className="sb-note-button"
                          onClick={() => void sharePlaylist(pl)}
                        >
                          {t("share-playlist", {
                            defaultValue: "Share playlist",
                          })}
                        </button>
                      )}
                      <button
                        className="sb-note-button"
                        onClick={() =>
                          setRenaming({
                            id: pl["@id"],
                            label: pl.label,
                            description: pl.description ?? "",
                          })
                        }
                      >
                        {t("edit-playlist", { defaultValue: "Edit playlist" })}
                      </button>
                      <button
                        className="sb-note-button sb-note-button-danger"
                        onClick={() =>
                          setDeleting({ id: pl["@id"], label: pl.label })
                        }
                      >
                        {t("delete-playlist", { defaultValue: "Delete" })}
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
          <PlayHistory state={state} />
        </>
      )}

      {tab === "customizations" && (
        <>
          <form
            className="sb-account-card"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void state.customizations
                .create(title.trim())
                .then((c) => setOpen(c["@id"]));
              setTitle("");
            }}
          >
            <p className="sb-small sb-muted">
              {t("customization-maker-blurb", {
                defaultValue:
                  "A branded reader: colours for light and dark, a logo, a default translation. Publish it and readers can pick it under Church theme.",
              })}
            </p>
            <input
              className="sb-note-editor"
              placeholder={t("customization-name", {
                defaultValue: "Name (your church or ministry)",
              })}
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
            <div className="sb-note-card-actions">
              <button
                type="submit"
                className="sb-note-button sb-note-button-primary"
                disabled={!title.trim()}
              >
                {t("create-customization", { defaultValue: "Create" })}
              </button>
            </div>
          </form>
          {!state.customizations.mine.live().length && (
            <p className="sb-pane-empty">
              {t("customizations-empty", {
                defaultValue: "No customizations yet.",
              })}
            </p>
          )}
          {state.customizations.mine.live().map((c) => {
            const isOpen = open === c["@id"];
            const published = state.publishing.isPublished(c["@id"]);
            return (
              <article key={c["@id"]} className="sb-note-card">
                <header className="sb-note-card-header">
                  <button
                    className="sb-note-card-ref"
                    onClick={() => setOpen(isOpen ? null : c["@id"])}
                  >
                    {c.label}
                  </button>
                  {c.logo && (
                    <img
                      className="sb-customization-logo"
                      src={c.logo}
                      alt=""
                    />
                  )}
                </header>
                {isOpen && (
                  <>
                    {c.hasVariant.map((v) => (
                      <div key={v["@id"]} className="sb-customization-variant">
                        <div className="sb-customization-variant-head">
                          <input
                            className="sb-note-editor sb-customization-variant-name"
                            aria-label={t("variant-name-of", {
                              defaultValue: "Name of the {{name}} variant",
                              name: v.label,
                            })}
                            defaultValue={v.label}
                            onBlur={(e) =>
                              void state.customizations.changeVariant(
                                c["@id"],
                                v["@id"],
                                { label: (e.target as HTMLInputElement).value }
                              )
                            }
                          />
                          <span className="sb-small sb-muted">
                            {v.scheme === "dark"
                              ? t("variant-dark", { defaultValue: "dark" })
                              : t("variant-light", { defaultValue: "light" })}
                          </span>
                          {c.hasVariant.length > 1 && (
                            <button
                              type="button"
                              className="sb-note-button sb-note-button-danger"
                              aria-label={t("variant-remove", {
                                defaultValue: "Remove the {{name}} variant",
                                name: v.label,
                              })}
                              onClick={() =>
                                void state.customizations.changeVariant(
                                  c["@id"],
                                  v["@id"],
                                  "remove"
                                )
                              }
                            >
                              {t("remove", { defaultValue: "Remove" })}
                            </button>
                          )}
                        </div>
                        <ThemeLivePreview
                          theme={themeFromVariant(c, {
                            ...v,
                            variables: {
                              ...v.variables,
                              ...Object.fromEntries(
                                Object.entries(variableDrafts)
                                  .filter(([k]) =>
                                    k.startsWith(`${c["@id"]}:${v["@id"]}:`)
                                  )
                                  .map(([k, x]) => [k.split(":").pop()!, x])
                              ),
                            },
                          })}
                        />
                        <div className="sb-customization-grid">
                          {EDITABLE_VARIABLES.map(([name, label]) => {
                            const key = `${c["@id"]}:${v["@id"]}:${name}`;
                            const value =
                              variableDrafts[key] ?? v.variables[name] ?? "";
                            return (
                              <label
                                key={name}
                                className="sb-small sb-customization-field"
                              >
                                <input
                                  type="color"
                                  value={
                                    /^#[0-9a-f]{6}$/i.test(value)
                                      ? value
                                      : "#888888"
                                  }
                                  onInput={(e) =>
                                    setVariableDrafts({
                                      ...variableDrafts,
                                      [key]: (e.target as HTMLInputElement)
                                        .value,
                                    })
                                  }
                                  onChange={(e) =>
                                    void state.customizations.setVariable(
                                      c["@id"],
                                      v["@id"],
                                      name,
                                      (e.target as HTMLInputElement).value
                                    )
                                  }
                                />{" "}
                                {label}
                              </label>
                            );
                          })}
                        </div>
                        <div className="sb-customization-grid sb-customization-text">
                          {EDITABLE_TEXT_VARIABLES.map(
                            ([name, label, hint]) => {
                              const key = `${c["@id"]}:${v["@id"]}:${name}`;
                              const value =
                                variableDrafts[key] ?? v.variables[name] ?? "";
                              return (
                                <label
                                  key={name}
                                  className="sb-small sb-customization-field sb-customization-field-text"
                                >
                                  <span>{label}</span>
                                  <input
                                    className="sb-note-editor"
                                    placeholder={hint}
                                    value={value}
                                    onInput={(e) =>
                                      setVariableDrafts({
                                        ...variableDrafts,
                                        [key]: (e.target as HTMLInputElement)
                                          .value,
                                      })
                                    }
                                    onBlur={(e) =>
                                      void state.customizations.setVariable(
                                        c["@id"],
                                        v["@id"],
                                        name,
                                        (
                                          e.target as HTMLInputElement
                                        ).value.trim()
                                      )
                                    }
                                  />
                                </label>
                              );
                            }
                          )}
                        </div>
                      </div>
                    ))}
                    <form
                      className="sb-customization-add-variant"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!variantName.trim()) return;
                        void state.customizations.addVariant(
                          c["@id"],
                          variantName,
                          variantScheme
                        );
                        setVariantName("");
                      }}
                    >
                      <input
                        className="sb-note-editor"
                        aria-label={t("variant-new-name", {
                          defaultValue: "New variant name",
                        })}
                        placeholder={t("variant-new-placeholder", {
                          defaultValue: "Another variant (e.g. Sepia)",
                        })}
                        value={variantName}
                        onInput={(e) =>
                          setVariantName((e.target as HTMLInputElement).value)
                        }
                      />
                      <select
                        className="sb-note-editor"
                        aria-label={t("variant-based-on", {
                          defaultValue: "Based on",
                        })}
                        value={variantScheme}
                        onChange={(e) =>
                          setVariantScheme(
                            (e.target as HTMLSelectElement).value as
                              | "light"
                              | "dark"
                          )
                        }
                      >
                        <option value="light">
                          {t("variant-from-light", {
                            defaultValue: "from Light",
                          })}
                        </option>
                        <option value="dark">
                          {t("variant-from-dark", {
                            defaultValue: "from Dark",
                          })}
                        </option>
                      </select>
                      <button
                        type="submit"
                        className="sb-note-button"
                        disabled={!variantName.trim()}
                      >
                        {t("variant-add", { defaultValue: "Add variant" })}
                      </button>
                    </form>
                    <div className="sb-customization-recommend">
                      <div className="sb-rp-section-label">
                        {t("recommended-extensions", {
                          defaultValue: "Recommended extensions",
                        })}
                      </div>
                      {state.extensions.registered.value.map((ext) => (
                        <label key={ext.id} className="sb-small sb-check">
                          <input
                            type="checkbox"
                            checked={(c.recommendsExtension ?? []).includes(
                              ext.id
                            )}
                            onChange={(e) => {
                              const on = (e.target as HTMLInputElement).checked;
                              const next = (c.recommendsExtension ?? [])
                                .filter((x) => x !== ext.id)
                                .concat(on ? [ext.id] : []);
                              void state.customizations.mine.save({
                                ...c,
                                recommendsExtension: next,
                              });
                            }}
                          />{" "}
                          {ext.label}
                        </label>
                      ))}
                      <p className="sb-small sb-muted">
                        {t("recommended-extensions-note", {
                          defaultValue:
                            "Turned on for a reader who picks this theme; they can turn any off.",
                        })}
                      </p>
                    </div>
                    <div className="sb-note-card-actions">
                      <PictureField
                        state={state}
                        target={LOGO}
                        label={t("logo", { defaultValue: "Logo" })}
                        cropTitle={t("crop-logo", {
                          defaultValue: "Fit your logo",
                        })}
                        disabled={!state.session.value}
                        onPicked={(url) =>
                          state.customizations.update(c["@id"], { logo: url })
                        }
                      />
                      <button
                        className="sb-note-button"
                        onClick={() =>
                          void state.customizations.update(c["@id"], {
                            defaultEdition: reading.translationId.value,
                          })
                        }
                      >
                        {t("default-edition-here", {
                          defaultValue: "Default translation:",
                        })}{" "}
                        {c.defaultEdition ?? "—"} →{" "}
                        {reading.translationId.value}
                      </button>
                      {canPublish && (
                        <button
                          className={`sb-note-button${published ? " sb-note-button-published" : ""}`}
                          disabled={state.publishing.busy.value === c["@id"]}
                          onClick={() =>
                            void (
                              published
                                ? state.publishing.withdrawWork(
                                    c["@id"],
                                    "customization"
                                  )
                                : state.publishing.publishWork(c)
                            ).catch(() => {})
                          }
                        >
                          {published
                            ? t("published", { defaultValue: "Published" })
                            : t("publish", { defaultValue: "Publish" })}
                        </button>
                      )}
                      {published && (
                        <button
                          className="sb-note-button"
                          title={t("customization-link-hint", {
                            defaultValue:
                              "A link that opens the reader in this theme",
                          })}
                          onClick={() => {
                            const entry =
                              state.customizations.available.value.find(
                                (a) => a.customization["@id"] === c["@id"]
                              );
                            const ref = entry
                              ? state.customizations.refOf(entry)
                              : c["@id"];
                            const url = `${location.origin}${location.pathname}?customization=${encodeURIComponent(ref)}`;
                            void navigator.clipboard?.writeText(url);
                            setCopied(c["@id"]);
                          }}
                        >
                          {copied === c["@id"]
                            ? t("link-copied", { defaultValue: "Copied" })
                            : t("copy-link", { defaultValue: "Copy link" })}
                        </button>
                      )}
                      <button
                        className="sb-note-button sb-note-button-danger"
                        onClick={() =>
                          void state.customizations.mine.remove(c["@id"])
                        }
                      >
                        {t("delete-customization", { defaultValue: "Delete" })}
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </>
      )}

      {tab === "plans" && (
        <>
          <form
            className="sb-account-card"
            onSubmit={(e) => {
              e.preventDefault();
              const to = Number(planTo) || reading.chapterNumber.value;
              const from = reading.chapterNumber.value;
              const label =
                title.trim() || `${reading.bookName.value} ${from}–${to}`;
              void plans
                .createFromChapters(
                  label,
                  reading.translationId.value,
                  reading.bookId.value,
                  from,
                  Math.max(from, to)
                )
                .then((p) => setOpen(p["@id"]));
              setTitle("");
              setPlanTo("");
            }}
          >
            <p className="sb-small sb-muted">
              {t("plan-maker-blurb", {
                defaultValue:
                  "A plan from the chapter on screen, one chapter a day, up to chapter:",
              })}
            </p>
            <input
              className="sb-note-editor"
              placeholder={t("plan-title", {
                defaultValue: "Plan title (optional)",
              })}
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
            />
            <input
              className="sb-note-editor"
              type="number"
              min={reading.chapterNumber.value}
              placeholder={String(reading.book.value?.numberOfChapters ?? "")}
              value={planTo}
              onInput={(e) => setPlanTo((e.target as HTMLInputElement).value)}
            />
            <div className="sb-note-card-actions">
              <button
                type="submit"
                className="sb-note-button sb-note-button-primary"
              >
                {t("create-plan", { defaultValue: "Create plan" })}
              </button>
              <button
                type="button"
                className="sb-note-button sb-plan-blank"
                onClick={() =>
                  void plans
                    .create(
                      title.trim() ||
                        t("new-plan-name", { defaultValue: "New plan" }),
                      [{ items: [] }]
                    )
                    .then((p) => {
                      setTitle("");
                      setOpen(p["@id"]);
                      setEditingPlan(p["@id"]);
                    })
                }
              >
                {t("plan-blank", { defaultValue: "Start a blank plan" })}
              </button>
            </div>
          </form>
          {!plans.views.value.length && (
            <p className="sb-pane-empty">
              {t("plans-empty", { defaultValue: "No reading plans yet." })}
            </p>
          )}
          {plans.views.value.map((v) => {
            const pl = v.plan;
            const isOpen = open === pl["@id"];
            return isOpen && editingPlan === pl["@id"] ? (
              <article key={pl["@id"]} className="sb-rp-card sb-note-card">
                <PlanEditor
                  state={state}
                  plan={pl}
                  onDone={() => setEditingPlan(null)}
                  parseReference={scriptureFromText}
                  passageOnScreen={scriptureItem}
                  label={(it) => itemLabel(state, it)}
                  ItemEditor={ItemEditor}
                />
              </article>
            ) : (
              <PlanCard
                key={pl["@id"]}
                state={state}
                view={v}
                open={isOpen}
                onToggle={() => setOpen(isOpen ? null : pl["@id"])}
                onEdit={() => setEditingPlan(pl["@id"])}
                onDelete={() =>
                  setDeleting({ id: pl["@id"], label: pl.label, kind: "plan" })
                }
              />
            );
          })}
        </>
      )}
      {deleting && (
        <div
          className="sb-footnote-modal-overlay"
          onClick={() => setDeleting(null)}
        >
          <div
            className="sb-footnote-modal sb-content-dialog"
            role="dialog"
            aria-label={
              deleting.kind === "plan"
                ? t("delete-reading-plan-confirm-title", {
                    defaultValue: "Delete reading plan?",
                  })
                : t("delete-playlist-confirm-title", {
                    defaultValue: "Delete playlist?",
                  })
            }
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <div className="sb-footnote-modal-header">
              <h3 className="sb-footnote-modal-title">
                {deleting.kind === "plan"
                  ? t("delete-reading-plan-confirm-title", {
                      defaultValue: "Delete reading plan?",
                    })
                  : t("delete-playlist-confirm-title", {
                      defaultValue: "Delete playlist?",
                    })}
              </h3>
            </div>
            <div className="sb-confirm-delete">
              <p className="sb-confirm-delete-message">
                {t("delete-playlist-confirm-message", {
                  title: deleting.label,
                  defaultValue: 'Delete "{{title}}"? This can\'t be undone.',
                })}
              </p>
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
                    const d = deleting;
                    setDeleting(null);
                    if (open === d.id) setOpen(null);
                    void (d.kind === "plan"
                      ? plans.remove(d.id)
                      : playlists.remove(d.id));
                  }}
                >
                  {t("delete", { defaultValue: "Delete" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
