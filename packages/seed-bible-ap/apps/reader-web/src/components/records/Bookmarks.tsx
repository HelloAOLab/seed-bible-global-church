// BOOKMARKS — the old reader's (packages/seed-bible components/Bookmarks): the ribbon glyphs, the chapter's bookmark
// button icon (a fan of up to three ribbons in their colours), the name-and-colour form, and the bookmark window the
// button opens: tap one of your bookmarks to move it to this chapter, or make a new one (at most five). The first one
// is offered already filled in as "My bookmark", so nothing is written until Save.
import { useEffect, useId, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  BOOKMARK_COLOR_IDS,
  MAX_BOOKMARKS,
  bookmarkColorValue,
  type BookmarkView,
} from "../../state/records/bookmarks";
import { chapterName, useBookNames } from "../reader/SidebarPanels";

type Translate = ReturnType<typeof useI18n>["t"];

/** The bookmark ribbon, in a 24×24 box spanning x 6–18 and y 3–21. */
const BOOKMARK_PATH =
  "M18 7V21L12 17L6 21V7C6 5.93913 6.42143 4.92172 7.17157 4.17157C7.92172 3.42143 8.93913 3 10 3H14C15.0609 3 16.0783 3.42143 16.8284 4.17157C17.5786 4.92172 18 5.93913 18 7Z";

/** More than three offset ribbons in a 24px button turn to mush; the label still names them all. */
const MAX_STACKED_GLYPHS = 3;
/** Where each ribbon of a stack sits, front first, centred by its visible outline (tilt included). */
const STACK_LAYOUTS: Record<number, { x: number; y: number }[]> = {
  2: [
    { x: -2.11, y: 0.94 },
    { x: 1.39, y: 0.44 },
  ],
  3: [
    { x: -5.08, y: 0.65 },
    { x: -1.58, y: 0.15 },
    { x: 1.92, y: -0.35 },
  ],
};
const STACK_SCALE = 0.92;
const STACK_TILT = 12;
const MAX_BOOKMARK_NAME_LENGTH = 40;

export function BookmarkGlyph(props: {
  colorId: string | undefined;
  size?: number;
}) {
  const size = props.size ?? 16;
  const color = bookmarkColorValue(props.colorId);
  return (
    <svg
      className="sb-bookmark-glyph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d={BOOKMARK_PATH}
        fill={color}
        stroke={color}
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
  );
}

/** The chapter's bookmark icon: an outline for none, a ribbon in its colour for one, a fan of up to three for more. */
export function BookmarkStackIcon(props: {
  bookmarks: readonly BookmarkView[];
  size?: number;
}) {
  const size = props.size ?? 22;
  const shown = props.bookmarks.slice(0, MAX_STACKED_GLYPHS);
  const maskPrefix = `sb-bookmark-stack-${useId().replace(/[^\w-]/g, "")}`;
  if (shown.length === 0)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d={BOOKMARK_PATH}
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
    );
  if (shown.length === 1)
    return <BookmarkGlyph colorId={shown[0]!.colorId} size={size} />;
  const layout = STACK_LAYOUTS[shown.length]!;
  const ribbons = shown.map((bookmark, index) => ({
    bookmark,
    maskId: `${maskPrefix}-${index}`,
    transform: `translate(${layout[index]!.x} ${layout[index]!.y}) scale(${STACK_SCALE}) rotate(${index * STACK_TILT} 12 21)`,
  }));
  // Each ribbon behind the front one is masked by a fattened copy of those in front: a real, transparent gap that
  // reads on any background.
  return (
    <svg
      className="sb-bookmark-stack-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      overflow="visible"
      aria-hidden="true"
    >
      <defs>
        {ribbons.slice(1).map((ribbon, behind) => (
          <mask
            key={ribbon.maskId}
            id={ribbon.maskId}
            maskUnits="userSpaceOnUse"
            x="-6"
            y="-6"
            width="36"
            height="36"
          >
            <rect x="-6" y="-6" width="36" height="36" fill="white" />
            {ribbons.slice(0, behind + 1).map((front) => (
              <path
                key={front.maskId}
                d={BOOKMARK_PATH}
                transform={front.transform}
                fill="black"
                stroke="black"
                stroke-width="3.4"
                stroke-linejoin="round"
              />
            ))}
          </mask>
        ))}
      </defs>
      {[...ribbons].reverse().map((ribbon, i) => (
        <g
          key={ribbon.bookmark.id}
          mask={i === ribbons.length - 1 ? undefined : `url(#${ribbon.maskId})`}
        >
          <path
            className="sb-bookmark-stack-ribbon"
            d={BOOKMARK_PATH}
            transform={ribbon.transform}
            fill={bookmarkColorValue(ribbon.bookmark.colorId)}
          />
        </g>
      ))}
    </svg>
  );
}

/** The bookmark button's label: the count and the names, so what the colours show is not lost. */
export function bookmarkButtonLabel(
  t: Translate,
  bookmarks: readonly BookmarkView[]
): string {
  if (bookmarks.length === 0)
    return t("bookmark-this-chapter", {
      defaultValue: "Bookmark this chapter",
    });
  const names = bookmarks.map((b) => b.name).join(", ");
  if (bookmarks.length === 1)
    return t("bookmark-on-this-chapter", {
      defaultValue: "Bookmark on this chapter: {{names}}",
      names,
    });
  return t("bookmarks-on-this-chapter", {
    defaultValue: "{{count}} bookmarks on this chapter: {{names}}",
    count: bookmarks.length,
    names,
  });
}

function colorLabel(t: Translate, colorId: string): string {
  switch (colorId) {
    case "orange":
      return t("bookmark-color-orange", { defaultValue: "Orange" });
    case "red":
      return t("bookmark-color-red", { defaultValue: "Red" });
    case "yellow":
      return t("bookmark-color-yellow", { defaultValue: "Yellow" });
    case "green":
      return t("bookmark-color-green", { defaultValue: "Green" });
    case "blue":
      return t("bookmark-color-blue", { defaultValue: "Blue" });
    default:
      return t("bookmark-color-purple", { defaultValue: "Purple" });
  }
}

export interface BookmarkDetails {
  name: string;
  colorId: string;
}

/** Name and colour for one bookmark: the window (making one) and the sidebar panel (making and editing) share it. */
export function BookmarkForm(props: {
  value: BookmarkDetails;
  onChange: (value: BookmarkDetails) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const { value, onChange, onSubmit, autoFocus, disabled } = props;
  const { t } = useI18n();
  return (
    <div className="sb-bookmark-form">
      <input
        className="sb-bookmark-form-name"
        type="text"
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={MAX_BOOKMARK_NAME_LENGTH}
        value={value.name}
        aria-label={t("bookmark-name", { defaultValue: "Bookmark name" })}
        placeholder={t("bookmark-name", { defaultValue: "Bookmark name" })}
        onInput={(e) =>
          onChange({ ...value, name: (e.target as HTMLInputElement).value })
        }
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" && onSubmit) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div
        className="sb-bookmark-form-colors"
        role="radiogroup"
        aria-label={t("bookmark-color", { defaultValue: "Bookmark color" })}
      >
        {BOOKMARK_COLOR_IDS.map((colorId) => {
          const on = value.colorId === colorId;
          return (
            <button
              key={colorId}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={colorLabel(t, colorId)}
              title={colorLabel(t, colorId)}
              disabled={disabled}
              className={`sb-bookmark-form-color${on ? " sb-bookmark-form-color-selected" : ""}`}
              style={{ color: bookmarkColorValue(colorId) }}
              onClick={() => onChange({ ...value, colorId })}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A bookmark's name over where it sits — "Genesis 3 • BSB". */
export function BookmarkLabel(props: {
  name: string;
  chapterText: string;
  translationId?: string;
}) {
  return (
    <span className="sb-bookmark-label">
      <span className="sb-bookmark-label-name">{props.name}</span>
      <span className="sb-bookmark-label-location">
        <span className="sb-bookmark-label-chapter" dir="auto">
          {props.chapterText}
        </span>
        {props.translationId && (
          <>
            <span className="sb-bookmark-label-sep" aria-hidden="true">
              •
            </span>
            <span className="sb-bookmark-label-translation">
              {props.translationId}
            </span>
          </>
        )}
      </span>
    </span>
  );
}

export function useDraftOf(state: ReaderState) {
  const { t } = useI18n();
  return () =>
    state.bookmarks.nextDraft(
      t("my-bookmark", { defaultValue: "My bookmark" }),
      (number) =>
        t("my-bookmark-numbered", {
          defaultValue: "My bookmark {{number}}",
          number,
        })
    );
}

/** The bookmark window, for the chapter on screen (`state.ui.bookmarkPicker`). */
export function BookmarkPicker({ state }: { state: ReaderState }) {
  const at = state.ui.bookmarkPicker.value;
  if (!at) return null;
  return <Picker key={`${at.chapterRef}:${at.edition ?? ""}`} state={state} />;
}

function Picker({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const at = state.ui.bookmarkPicker.value!;
  const { bookmarks } = state;
  const all = bookmarks.all.value;
  useBookNames(
    state,
    all.map((b) => b.edition ?? "")
  );
  const draftOf = useDraftOf(state);
  const [draft, setDraft] = useState<BookmarkDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const shownDraft = draft ?? (all.length === 0 ? draftOf() : null);
  const canMake = !busy && !!shownDraft && shownDraft.name.trim() !== "";
  const close = () => (state.ui.bookmarkPicker.value = null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const run = async (action: () => Promise<unknown>, closeAfter: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (closeAfter) close();
    } finally {
      setBusy(false);
    }
  };
  const make = () => {
    if (!canMake || !shownDraft) return;
    void run(
      () =>
        bookmarks.add(
          at.chapterRef,
          shownDraft.name,
          shownDraft.colorId,
          at.edition
        ),
      true
    );
  };

  const title = t("bookmark-chapter", { defaultValue: "Bookmark chapter" });
  return (
    <div className="sb-footnote-modal-overlay" onClick={close}>
      <div
        className="sb-footnote-modal"
        role="dialog"
        aria-label={title}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">{title}</h3>
          <button
            type="button"
            className="sb-footnote-modal-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={close}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="sb-footnote-modal-content">
          <div className="sb-bookmark-picker">
            {all.length > 0 && (
              <p className="sb-bookmark-picker-hint">
                {t("bookmark-move-hint", {
                  defaultValue: "Tap a bookmark to move it to this chapter.",
                })}
              </p>
            )}
            <div className="sb-bookmark-picker-list">
              {all.map((b) => (
                <div key={b.id} className="sb-bookmark-picker-row">
                  <button
                    type="button"
                    disabled={busy}
                    className="sb-bookmark-picker-choice"
                    title={t("move-bookmark-here", {
                      defaultValue: "Move {{name}} here",
                      name: b.name,
                    })}
                    onClick={() =>
                      void run(
                        () => bookmarks.move(b.id, at.chapterRef, at.edition),
                        true
                      )
                    }
                  >
                    <BookmarkGlyph colorId={b.colorId} size={18} />
                    <BookmarkLabel
                      name={b.name}
                      chapterText={chapterName(state, b.chapter, b.edition)}
                      translationId={b.edition}
                    />
                  </button>
                  <button
                    type="button"
                    className="sb-bookmark-picker-remove"
                    disabled={busy}
                    aria-label={t("remove-bookmark-named", {
                      defaultValue: "Remove {{name}}",
                      name: b.name,
                    })}
                    title={t("remove-bookmark", {
                      defaultValue: "Remove bookmark",
                    })}
                    onClick={() =>
                      void run(() => bookmarks.remove(b.id), false)
                    }
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      delete
                    </span>
                  </button>
                </div>
              ))}
              {shownDraft && (
                <div className="sb-bookmark-picker-row sb-bookmark-picker-row-new">
                  <div className="sb-bookmark-picker-new-heading">
                    <BookmarkGlyph colorId={shownDraft.colorId} size={18} />
                    <span className="sb-bookmark-label-name">
                      {t("new-bookmark", { defaultValue: "New bookmark" })}
                    </span>
                  </div>
                  {draft && (
                    <button
                      type="button"
                      className="sb-bookmark-picker-remove"
                      disabled={busy}
                      aria-label={t("discard-new-bookmark", {
                        defaultValue: "Discard new bookmark",
                      })}
                      title={t("discard-new-bookmark", {
                        defaultValue: "Discard new bookmark",
                      })}
                      onClick={() => setDraft(null)}
                    >
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        close
                      </span>
                    </button>
                  )}
                  <div className="sb-bookmark-picker-form">
                    <BookmarkForm
                      value={shownDraft}
                      disabled={busy}
                      onChange={setDraft}
                      onSubmit={make}
                    />
                    <div className="sb-bookmark-picker-actions">
                      <button
                        type="button"
                        className="sb-bookmark-picker-save"
                        disabled={!canMake}
                        onClick={make}
                      >
                        {busy
                          ? t("saving", { defaultValue: "Saving…" })
                          : t("save", { defaultValue: "Save" })}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {!shownDraft && (
              <div className="sb-bookmark-picker-add">
                <button
                  type="button"
                  className="sb-bookmark-add-new"
                  disabled={!bookmarks.canCreate.value || busy}
                  onClick={() => setDraft(draftOf())}
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                  >
                    add
                  </span>
                  <span>
                    {t("new-bookmark", { defaultValue: "New bookmark" })}
                  </span>
                </button>
                {!bookmarks.canCreate.value && (
                  <p className="sb-bookmark-cap-note">
                    {t("bookmark-limit-reached", {
                      defaultValue:
                        "You can have up to {{max}} bookmarks. Move or remove one to make room.",
                      max: MAX_BOOKMARKS,
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
