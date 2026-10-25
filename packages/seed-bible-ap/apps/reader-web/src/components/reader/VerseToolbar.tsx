// THE VERSE TOOLBAR — what the old BibleReaderToolbar shows over a selection (`sb-verse-toolbar-*` from the copied
// stylesheet): on a desktop it floats just above the selected verse and follows it as the page scrolls. Its row is
// the old reader's — Highlight · Save · Note · Copy · the extensions' tools (Compare) · Share · Cancel — and
// Highlight turns it into the colour picker (the reference with ‹ back, the swatches, Clear). On a phone it is the old
// reader's sheet along the bottom: a handle, ×, the reference and four cards (Highlight · Save · Note · Copy); the
// rest (Share, Compare, …) is a row a swipe up — or a tap on the handle — reveals, and a swipe down closes it.
import { handleHorizontalListKeyNav } from "../keyboardNav";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { passageOf } from "../../state/records/marks";
import { shareUrl } from "../../state/reading/route";
import { getVersePlainText } from "./chapterContent";
import { MAX_CUSTOM_COLORS } from "../../state/chrome/settings";
import { openSavePicker } from "../records/SavePicker";
import { SelectionNotes } from "../records/NotesPane";
import type { HighlightColorId } from "../../state/records/highlights";
import { copyTextOf, runsLabel, runsOf } from "../../state/reading/verseRuns";

export function VerseToolbar({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  const verses = state.selection.verses.value;
  const [picker, setPicker] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const key = verses.join();
  // The phone sheet: how much of its second row shows (px), how far a downward swipe has pulled it, and the drag.
  const [reveal, setReveal] = useState(0);
  const [full, setFull] = useState(0);
  const [dismiss, setDismiss] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; reveal: number; moved: boolean } | null>(
    null
  );
  const row = useRef<HTMLDivElement>(null);
  const swiped = useRef(false);
  // A desktop toolbar can be dragged out of the way (the old reader's); a new choice puts it back beside the verses.
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });
  const moving = useRef<{
    id: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);
  useEffect(() => {
    setPicker(false);
    setReveal(0);
    setDismiss(0);
    setOffset({ dx: 0, dy: 0 });
  }, [key]);
  useLayoutEffect(() => {
    if (row.current) setFull(row.current.scrollHeight);
  });
  // Just above the first line of the selection, kept there while the page or the reading column scrolls.
  useLayoutEffect(() => {
    if (!verses.length) return;
    const place = () => {
      const el = document.querySelector<HTMLElement>(
        `.sb-bible-reader-active [data-verse-number="${Math.min(...verses)}"]`
      );
      const r = el?.getClientRects()[0];
      setAnchor(r ? { x: r.left + r.width / 2, y: r.top } : null);
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [key]);
  if (!verses.length) return null;
  const { reading } = state;
  const chapterRef = reading.chapterRef.value;
  const start = Math.min(...verses);
  const end = Math.max(...verses);
  const runs = runsOf(verses);
  const ref = `${reading.bookName.value} ${reading.chapterNumber.value}:${runsLabel(runs)}`;
  /** Colour (or clear) each run of the choice. */
  const markRuns = (colorId?: HighlightColorId | `#${string}`) => {
    for (const [a, b] of runs)
      void (colorId
        ? state.highlights.set(chapterRef, a, b, colorId)
        : state.highlights.clear(chapterRef, a, b));
  };
  const current = state.highlights.forChapter(chapterRef).value.find((h) => {
    const v = h.verse;
    return typeof v === "number"
      ? verses.includes(v)
      : verses.some((n) => n >= v[0] && n <= v[1]);
  });

  /** The chosen verses' words, each run with its reference after it (the old reader's format). */
  const versesText = () => {
    const chapter = reading.chapterData.value;
    if (!chapter) return "";
    const words = new Map<number, string>();
    for (const c of chapter.chapter.content)
      if (c && typeof c === "object" && c.type === "verse")
        words.set(c.number, getVersePlainText(c.content));
    return copyTextOf(
      runsOf(state.selection.verses.value),
      (v) => words.get(v) ?? "",
      reading.bookName.value,
      reading.chapterNumber.value,
      reading.translation.value?.shortName ?? reading.translationId.value
    );
  };
  const copyText = async () => {
    const text = versesText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      state.ui.toast.value = { key: "copied" };
    } catch {
      /* the clipboard refused */
    }
  };
  const menuAt = state.ui.verseMenuAt.value;
  const phone = typeof window !== "undefined" && window.innerWidth <= 720;
  // As a right-click menu the toolbar opens at the pointer, kept on screen; on a desktop it sits above the verse.
  const style = menuAt
    ? {
        left: `${Math.max(8, Math.min(menuAt.x, window.innerWidth - 380))}px`,
        top: `${Math.max(8, Math.min(menuAt.y, window.innerHeight - 140))}px`,
        bottom: "auto",
        transform: "none",
      }
    : !phone && anchor
      ? {
          left: `${Math.min(Math.max(anchor.x + offset.dx, 200), window.innerWidth - 200)}px`,
          top: `${Math.min(Math.max(anchor.y - 12 + offset.dy, picker ? 140 : 90), window.innerHeight - 100)}px`,
        }
      : undefined;
  const saved =
    state.saves.forPassage(passageOf(chapterRef, start, end)).length > 0;
  const Action = (props: {
    icon: string;
    label: string;
    onClick: () => void;
    className?: string;
    pressed?: boolean;
    filled?: boolean;
  }) => (
    <div className="sb-verse-toolbar-action-item">
      <button
        type="button"
        className={`sb-verse-toolbar-action${props.className ? ` ${props.className}` : ""}`}
        aria-label={props.label}
        title={props.label}
        aria-pressed={props.pressed}
        onClick={props.onClick}
      >
        <span className="sb-verse-toolbar-action-icon">
          <span
            className={`material-symbols-outlined${props.filled ? " sb-icon-filled" : ""}`}
          >
            {props.icon}
          </span>
        </span>
        <span className="sb-verse-toolbar-action-label">{props.label}</span>
      </button>
    </div>
  );
  const tools = [...state.extensions.verseTools.value]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .filter(
      (tool) =>
        !tool.isVisible || tool.isVisible({ chapterRef, start, end, verses })
    );
  const canShowEveryone =
    state.live.active.value && state.live.canHighlight.value;

  // An embed is read on someone else's page: no marking tools there, as in the old reader's embed.
  const marking = !state.ui.embed.value;
  const highlightA = (
    <Action
      key="highlight"
      icon="format_ink_highlighter"
      label={t("highlight", { defaultValue: "Highlight" })}
      className="sb-verse-toolbar-highlight-trigger"
      onClick={() => setPicker(true)}
    />
  );
  const saveA = (
    <Action
      key="save"
      icon="star"
      filled={saved}
      pressed={saved}
      label={t("save-verses", { defaultValue: "Save" })}
      className={`sb-verse-toolbar-save-trigger${saved ? " sb-verse-toolbar-save-trigger-active" : ""}`}
      onClick={() => {
        openSavePicker(
          state,
          chapterRef,
          { start, end },
          reading.translationId.value
        );
        state.selection.clear();
      }}
    />
  );
  const noteA = (
    <Action
      key="note"
      icon="sticky_note_2"
      label={t("note", { defaultValue: "Note" })}
      className="sb-verse-toolbar-note"
      onClick={() => {
        state.ui.pane.value = "notes";
        state.ui.noteDraft.value = { start, end };
      }}
    />
  );
  const copyA = (
    <Action
      key="copy"
      icon={copied ? "check" : "content_copy"}
      label={
        copied
          ? t("link-copied", { defaultValue: "Copied" })
          : t("copy-verse", { defaultValue: "Copy" })
      }
      className="sb-verse-toolbar-copy"
      onClick={() => void copyText()}
    />
  );
  const editingPlaylist = state.ui.editingPlaylist.value
    ? state.playlists.byId(state.ui.editingPlaylist.value)
    : null;
  const addToPlaylistA = editingPlaylist ? (
    <Action
      key="add-to-playlist"
      icon="playlist_add"
      label={t("add-to-playlist", { defaultValue: "Add to Playlist" })}
      onClick={() => {
        void state.playlists.addItem(editingPlaylist["@id"], {
          "@type": "seed:ScriptureItem",
          aboutPassage:
            start === end
              ? `${chapterRef}.${start}`
              : `${chapterRef}.${start}-${chapterRef}.${end}`,
          ofEdition: reading.translationId.value,
        });
        state.selection.clear();
      }}
    />
  ) : null;
  const planEditing = state.ui.planEditing.value;
  const addToPlanA = planEditing ? (
    <Action
      key="add-to-plan"
      icon="library_add"
      label={t("add-to-reading-plan", { defaultValue: "Add to plan" })}
      onClick={() => {
        state.ui.planAdd.value = {
          "@type": "seed:ScriptureItem",
          aboutPassage:
            start === end
              ? `${chapterRef}.${start}`
              : `${chapterRef}.${start}-${chapterRef}.${end}`,
          ofEdition: reading.translationId.value,
        };
        state.ui.toast.value = {
          key: "added-to-reading-plan-session",
          values: { session: String(planEditing.day + 1) },
        };
        state.selection.clear();
      }}
    />
  ) : null;
  const toolsA = tools.map((tool) => (
    <Action
      key={tool.id}
      icon={tool.icon}
      label={tool.label}
      onClick={() => {
        tool.onSelect({ chapterRef, start, end, verses });
        state.selection.clear();
      }}
    />
  ));
  const shareA = (
    <Action
      key="share"
      icon="share"
      label={t("share-verses", { defaultValue: "Share" })}
      onClick={() => {
        state.ui.share.value = {
          title: ref,
          text: versesText(),
          url: shareUrl(
            location.origin,
            {
              translationId: reading.translationId.value,
              bookId: reading.bookId.value,
              chapterNumber: reading.chapterNumber.value,
            },
            start,
            end
          ),
        };
      }}
    />
  );
  const everyoneA = canShowEveryone ? (
    <Action
      key="everyone"
      icon="campaign"
      label={t("session-show-everyone", {
        defaultValue: "Show everyone",
      })}
      onClick={() => {
        void state.live.decorate(start, end, current?.colorId ?? "yellow");
        state.selection.clear();
      }}
    />
  ) : null;
  const cancelA = (
    <Action
      key="cancel"
      icon="close"
      label={t("cancel", { defaultValue: "Cancel" })}
      className="sb-verse-toolbar-cancel"
      onClick={() => state.selection.clear()}
    />
  );
  const pickerEl = (
    <div
      className="sb-verse-toolbar-tools sb-verse-toolbar-picker"
      role="toolbar"
      onKeyDown={(e) => {
        if ((e as KeyboardEvent).key === "Escape") {
          e.preventDefault();
          setPicker(false);
          return;
        }
        handleHorizontalListKeyNav(
          e as KeyboardEvent,
          e.currentTarget as HTMLElement
        );
      }}
    >
      <div
        className="sb-verse-toolbar-swatches"
        role="group"
        aria-label={t("highlight-colors", {
          defaultValue: "Highlight colors",
        })}
      >
        {state.highlights.colors.map((c) => (
          <button
            key={c}
            type="button"
            className="sb-verse-toolbar-color-button"
            aria-label={t("highlight", { defaultValue: "Highlight" }) + ` ${c}`}
            title={c}
            aria-pressed={!current?.customColor && current?.colorId === c}
            onClick={() => {
              markRuns(c);
              state.selection.clear();
            }}
          >
            <span
              className={`sb-verse-toolbar-color${!current?.customColor && current?.colorId === c ? " sb-verse-toolbar-color-active" : ""}`}
              style={{ background: `var(--sb-highlight-${c}-color)` }}
            />
          </button>
        ))}
        {/* The reader's own colours, after the twelve; right-click (a long press) takes one away. */}
        {state.settings.customColors.value.map((hex) => (
          <button
            key={hex}
            type="button"
            className="sb-verse-toolbar-color-button sb-verse-toolbar-custom-color"
            aria-label={t("highlight-custom", {
              color: hex,
              defaultValue: "Highlight {{color}}",
            })}
            title={t("custom-color-remove-hint", {
              color: hex,
              defaultValue: "{{color}} — right-click to remove",
            })}
            aria-pressed={current?.customColor === hex}
            onClick={() => {
              markRuns(hex as `#${string}`);
              state.selection.clear();
            }}
            onContextMenu={(e: MouseEvent) => {
              e.preventDefault();
              state.settings.customColors.value =
                state.settings.customColors.value.filter((c) => c !== hex);
            }}
          >
            <span
              className={`sb-verse-toolbar-color${current?.customColor === hex ? " sb-verse-toolbar-color-active" : ""}`}
              style={{ background: hex }}
            />
          </button>
        ))}
        {state.settings.customColors.value.length < MAX_CUSTOM_COLORS && (
          <label
            className="sb-verse-toolbar-color-button sb-verse-toolbar-add-color"
            title={t("add-color", { defaultValue: "Add color" })}
          >
            <span
              className="sb-verse-toolbar-color sb-verse-toolbar-color-slot"
              aria-hidden="true"
            >
              <span className="material-symbols-outlined">add</span>
            </span>
            <input
              type="color"
              className="sr-only"
              aria-label={t("add-custom-color", {
                defaultValue: "Add custom color",
              })}
              onChange={(e) => {
                const hex = (e.target as HTMLInputElement).value.toLowerCase();
                if (!/^#[0-9a-f]{6}$/.test(hex)) return;
                state.settings.customColors.value = [
                  ...state.settings.customColors.value.filter((c) => c !== hex),
                  hex,
                ].slice(-MAX_CUSTOM_COLORS);
                markRuns(hex as `#${string}`);
                state.selection.clear();
              }}
            />
          </label>
        )}
      </div>
      <div className="sb-verse-toolbar-picker-actions">
        <button
          type="button"
          className="sb-verse-toolbar-clear"
          disabled={!current}
          aria-label={t("clear-highlight", {
            defaultValue: "Clear highlight",
          })}
          title={t("clear", { defaultValue: "Clear" })}
          onClick={() => {
            markRuns();
            state.selection.clear();
          }}
        >
          <span className="material-symbols-outlined">ink_eraser</span>
          <span className="sb-verse-toolbar-action-text">
            {t("clear", { defaultValue: "Clear" })}
          </span>
        </button>
      </div>
    </div>
  );

  if (phone && !menuAt) {
    const more = [
      marking && addToPlaylistA,
      marking && addToPlanA,
      shareA,
      ...toolsA,
      marking && everyoneA,
    ].filter(Boolean);
    const open = reveal > 0;
    const end_ = () => {
      const d = drag.current;
      drag.current = null;
      setDragging(false);
      if (!d) return;
      if (d.moved) {
        swiped.current = true;
        setTimeout(() => (swiped.current = false), 0);
      }
      if (dismiss > 80) {
        setDismiss(0);
        state.selection.clear();
        return;
      }
      setDismiss(0);
      setReveal(reveal > full / 2 ? full : 0);
    };
    return (
      <div
        className={`sb-verse-toolbar sb-verse-toolbar-mobile${dragging ? " sb-verse-sheet-dragging" : ""}`}
        role="toolbar"
        aria-label={ref}
        style={dismiss ? { transform: `translateY(${dismiss}px)` } : undefined}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        onClickCapture={(e: MouseEvent) => {
          // A swipe that ended over a card is not a tap on it.
          if (!swiped.current) return;
          e.stopPropagation();
          e.preventDefault();
        }}
        onPointerDown={(e: PointerEvent) => {
          drag.current = { y: e.clientY, reveal, moved: false };
        }}
        onPointerMove={(e: PointerEvent) => {
          const d = drag.current;
          if (!d) return;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.abs(dy) < 8) return;
          if (!d.moved) {
            d.moved = true;
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }
          const r = Math.max(0, Math.min(full, d.reveal - dy));
          setReveal(picker ? 0 : r);
          setDismiss(d.reveal - dy < 0 ? Math.max(0, dy - d.reveal) : 0);
        }}
        onPointerUp={end_}
        onPointerCancel={end_}
      >
        <div
          className="sb-verse-toolbar-handle-area"
          role="button"
          tabIndex={more.length ? 0 : -1}
          aria-expanded={open}
          aria-label={
            open
              ? t("show-fewer-verse-actions", {
                  defaultValue: "Show fewer actions",
                })
              : t("show-more-verse-actions", {
                  defaultValue: "Show more actions",
                })
          }
          onClick={() => setReveal(open ? 0 : full)}
          onKeyDown={(e) => {
            const k = (e as KeyboardEvent).key;
            if (k === "Enter" || k === " ") {
              e.preventDefault();
              setReveal(open ? 0 : full);
            }
          }}
        >
          <div className="sb-verse-toolbar-handle" />
        </div>
        <button
          type="button"
          className="sb-verse-toolbar-close"
          aria-label={
            picker
              ? t("back", { defaultValue: "Back" })
              : t("close", { defaultValue: "Close" })
          }
          title={
            picker
              ? t("back", { defaultValue: "Back" })
              : t("close", { defaultValue: "Close" })
          }
          onClick={() => (picker ? setPicker(false) : state.selection.clear())}
        >
          <span className="material-symbols-outlined">
            {picker ? "arrow_back" : "close"}
          </span>
        </button>
        <div className="sb-verse-toolbar-ref">
          <span className="sb-verse-toolbar-ref-text" aria-live="polite">
            {ref}
          </span>
        </div>
        {picker ? (
          pickerEl
        ) : (
          <div className="sb-verse-toolbar-tools sb-verse-toolbar-cards">
            {marking && highlightA}
            {marking && saveA}
            {marking && noteA}
            {copyA}
            {more.length > 0 && (
              <div
                className={`sb-verse-toolbar-overflow${open ? "" : " sb-verse-toolbar-overflow-closed"}`}
                style={{ height: `${reveal}px` }}
              >
                <div className="sb-verse-toolbar-overflow-row" ref={row}>
                  <div className="sb-verse-toolbar-overflow-pinned">{more}</div>
                  <SelectionNotes state={state} />
                </div>
              </div>
            )}
          </div>
        )}
        {!picker && more.length > 0 && !open && (
          <div className="sb-verse-toolbar-swipe-hint" aria-hidden="true">
            <span className="material-symbols-outlined">
              keyboard_double_arrow_up
            </span>
            <span>
              {t("swipe-up-more", { defaultValue: "Swipe up to see more" })}
            </span>
          </div>
        )}
        {picker && (
          <div
            className="sb-verse-toolbar-swipe-hint sb-verse-toolbar-swipe-hint-colors"
            aria-hidden="true"
          >
            <span className="material-symbols-outlined">
              keyboard_double_arrow_right
            </span>
            <span>
              {t("swipe-to-see-more", { defaultValue: "Swipe to see more" })}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`sb-verse-toolbar ${menuAt ? "sb-verse-toolbar-menu" : anchor ? "sb-verse-toolbar-draggable sb-verse-toolbar-anchored" : "sb-verse-toolbar-docked"}`}
      role={menuAt ? "menu" : "toolbar"}
      style={style}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onPointerDown={(e: PointerEvent) => {
        if (menuAt || !anchor) return;
        if ((e.target as HTMLElement | null)?.closest("button, input, label"))
          return;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        moving.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          dx: offset.dx,
          dy: offset.dy,
        };
        e.preventDefault();
      }}
      onPointerMove={(e: PointerEvent) => {
        const m = moving.current;
        if (!m || m.id !== e.pointerId) return;
        setOffset({ dx: m.dx + e.clientX - m.x, dy: m.dy + e.clientY - m.y });
      }}
      onPointerUp={(e: PointerEvent) => {
        if (moving.current?.id !== e.pointerId) return;
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        moving.current = null;
      }}
    >
      {picker && (
        <div className="sb-verse-toolbar-ref sb-verse-toolbar-ref-with-back">
          <button
            type="button"
            className="sb-verse-toolbar-back"
            aria-label={t("back", { defaultValue: "Back" })}
            title={t("back", { defaultValue: "Back" })}
            onClick={() => setPicker(false)}
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span className="sb-verse-toolbar-ref-text">{ref}</span>
        </div>
      )}
      {picker ? (
        pickerEl
      ) : (
        <div
          className="sb-verse-toolbar-tools"
          onKeyDown={(e) =>
            handleHorizontalListKeyNav(
              e as KeyboardEvent,
              e.currentTarget as HTMLElement
            )
          }
        >
          {marking && highlightA}
          {marking && saveA}
          {marking && noteA}
          {copyA}
          {marking && addToPlaylistA}
          {marking && addToPlanA}
          {toolsA}
          {shareA}
          {marking && everyoneA}
          {cancelA}
        </div>
      )}
    </div>
  );
}
