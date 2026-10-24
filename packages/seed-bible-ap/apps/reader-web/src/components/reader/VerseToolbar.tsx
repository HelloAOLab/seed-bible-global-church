// THE VERSE TOOLBAR — what the old BibleReaderToolbar shows over a selection (`sb-verse-toolbar-*` from the copied
// stylesheet): on a desktop it floats just above the selected verse and follows it as the page scrolls. Its row is
// the old reader's — Highlight · Save · Note · Copy · the extensions' tools (Compare) · Share · Cancel — and
// Highlight turns it into the colour picker (the reference with ‹ back, the swatches, Clear).
import { handleHorizontalListKeyNav } from "../keyboardNav";
import { useEffect, useLayoutEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { passageOf } from "../../state/records/marks";
import { shareUrl } from "../../state/reading/route";
import { getVersePlainText } from "./chapterContent";

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
  useEffect(() => setPicker(false), [key]);
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
  const ref = `${reading.bookName.value} ${reading.chapterNumber.value}:${start === end ? start : `${start}–${end}`}`;
  const current = state.highlights.forChapter(chapterRef).value.find((h) => {
    const v = h.verse;
    return typeof v === "number"
      ? verses.includes(v)
      : verses.some((n) => n >= v[0] && n <= v[1]);
  });

  /** The verses' text with their reference — what Copy puts on the clipboard. */
  const copyText = async () => {
    const chapter = reading.chapterData.value;
    if (!chapter) return;
    const text = chapter.chapter.content
      .flatMap((c) =>
        c &&
        typeof c === "object" &&
        c.type === "verse" &&
        c.number >= start &&
        c.number <= end
          ? [getVersePlainText(c.content)]
          : []
      )
      .join(" ");
    const label =
      reading.translation.value?.shortName ?? reading.translationId.value;
    try {
      await navigator.clipboard.writeText(`${text}\n— ${ref} (${label})`);
      setCopied(true);
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
          left: `${Math.min(Math.max(anchor.x, 200), window.innerWidth - 200)}px`,
          top: `${Math.min(Math.max(anchor.y - 12, picker ? 140 : 90), window.innerHeight - 100)}px`,
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
    state.live.active.value &&
    (state.live.myRole.value === "leader" ||
      state.live.myRole.value === "decorator");

  return (
    <div
      className={`sb-verse-toolbar ${menuAt ? "sb-verse-toolbar-menu" : !phone && anchor ? "sb-verse-toolbar-draggable sb-verse-toolbar-anchored" : "sb-verse-toolbar-docked"}`}
      role={menuAt ? "menu" : "toolbar"}
      style={style}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      {(picker || phone) && (
        <div
          className={`sb-verse-toolbar-ref${picker ? " sb-verse-toolbar-ref-with-back" : ""}`}
        >
          {picker && (
            <button
              type="button"
              className="sb-verse-toolbar-back"
              aria-label={t("back", { defaultValue: "Back" })}
              title={t("back", { defaultValue: "Back" })}
              onClick={() => setPicker(false)}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
          )}
          <span className="sb-verse-toolbar-ref-text">{ref}</span>
        </div>
      )}
      {picker ? (
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
                aria-label={
                  t("highlight", { defaultValue: "Highlight" }) + ` ${c}`
                }
                title={c}
                aria-pressed={current?.colorId === c}
                onClick={() => {
                  void state.highlights.set(chapterRef, start, end, c);
                  state.selection.clear();
                }}
              >
                <span
                  className={`sb-verse-toolbar-color${current?.colorId === c ? " sb-verse-toolbar-color-active" : ""}`}
                  style={{ background: `var(--sb-highlight-${c}-color)` }}
                />
              </button>
            ))}
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
                void state.highlights.clear(chapterRef, start, end);
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
          <Action
            icon="format_ink_highlighter"
            label={t("highlight", { defaultValue: "Highlight" })}
            className="sb-verse-toolbar-highlight-trigger"
            onClick={() => setPicker(true)}
          />
          <Action
            icon="star"
            filled={saved}
            pressed={saved}
            label={t("save-verses", { defaultValue: "Save" })}
            className={`sb-verse-toolbar-save-trigger${saved ? " sb-verse-toolbar-save-trigger-active" : ""}`}
            onClick={() => {
              void state.saves.toggle(
                chapterRef,
                { start, end },
                reading.translationId.value
              );
              state.selection.clear();
            }}
          />
          <Action
            icon="sticky_note_2"
            label={t("note", { defaultValue: "Note" })}
            className="sb-verse-toolbar-note"
            onClick={() => {
              state.ui.pane.value = "notes";
              state.ui.noteDraft.value = { start, end };
            }}
          />
          <Action
            icon={copied ? "check" : "content_copy"}
            label={
              copied
                ? t("link-copied", { defaultValue: "Copied" })
                : t("copy-verse", { defaultValue: "Copy" })
            }
            className="sb-verse-toolbar-copy"
            onClick={() => void copyText()}
          />
          {tools.map((tool) => (
            <Action
              key={tool.id}
              icon={tool.icon}
              label={tool.label}
              onClick={() => {
                tool.onSelect({ chapterRef, start, end, verses });
                state.selection.clear();
              }}
            />
          ))}
          <Action
            icon="share"
            label={t("share-verses", { defaultValue: "Share" })}
            onClick={() => {
              state.ui.share.value = {
                title: ref,
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
          {canShowEveryone && (
            <Action
              icon="campaign"
              label={t("session-show-everyone", {
                defaultValue: "Show everyone",
              })}
              onClick={() => {
                void state.live.decorate(
                  start,
                  end,
                  current?.colorId ?? "yellow"
                );
                state.selection.clear();
              }}
            />
          )}
          <Action
            icon="close"
            label={t("cancel", { defaultValue: "Cancel" })}
            className="sb-verse-toolbar-cancel"
            onClick={() => state.selection.clear()}
          />
        </div>
      )}
    </div>
  );
}
