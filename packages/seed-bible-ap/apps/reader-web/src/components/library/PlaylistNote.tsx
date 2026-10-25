// A PLAYLIST WHILE IT PLAYS — the old reader's ScriptureNote and PlaylistFinishedModal: beside the reading, a card
// with the item ("John 3:16–18", its note, a note or a link), Previous, "2 of 5" and Next →, and a ✕ that folds it
// to a Show note tab; it is there with the Library closed, so a playlist can be read through in the reader itself.
// After the last item: "You've reached the end of …" with Share playlist.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { PlayingItem } from "./LibraryPane";
import { spanOf } from "../../state/records/marks";
import type { PlaylistItem } from "@seed/seed-schema";
import { sharedLinkOf } from "../../state/social/sharedPage";

function title(state: ReaderState, it: PlaylistItem): string {
  if (it["@type"] === "seed:ScriptureItem") {
    const { chapter, start, end } = spanOf(it.aboutPassage);
    const [book, ch] = chapter.split(".");
    const name =
      state.reading.books.value.find((b) => b.id === book)?.name ?? book;
    const verses =
      it.aboutPassage.split(".").length > 2
        ? `:${start}${end !== start ? `–${end}` : ""}`
        : "";
    return `${name} ${ch}${verses}`;
  }
  if (it["@type"] === "seed:HtmlItem") return it.label ?? "";
  return it.label ?? it.url;
}

export function PlaylistNote({ state }: { state: ReaderState }) {
  const { t, isRtl } = useI18n();
  const pl = state.playlists;
  const c = pl.current.value;
  // In the Library its own player shows the item.
  if (!c || state.ui.pane.value === "library") return null;
  const it = c.item;
  const hidden = pl.noteHidden.value;
  const last = c.index + 1 >= c.count;
  const hasBody = it["@type"] !== "seed:ScriptureItem" || !!it.note?.trim();

  if (hidden)
    return (
      <button
        type="button"
        className="sb-scripture-note-show-tab sb-playlist-note-show"
        onClick={() => (pl.noteHidden.value = false)}
      >
        {t("playlist-scripture-note-show", { defaultValue: "Show note" })}
        <span className="material-symbols-outlined" aria-hidden="true">
          keyboard_arrow_up
        </span>
      </button>
    );

  const label = title(state, it);
  return (
    <div className="sb-scripture-note-layer sb-playlist-note-layer">
      <div
        className="sb-scripture-note-popover sb-playlist-note"
        role="dialog"
        aria-label={t("playlist-scripture-note-aria", {
          defaultValue: "Note on {{passage}}",
          passage: label,
        })}
      >
        <div className="sb-scripture-note-header">
          <h3 className="sb-scripture-note-title">
            <span className="sb-playlist-note-playlist">
              {c.playlist.label}
            </span>
            {label && <span className="sb-playlist-note-passage">{label}</span>}
          </h3>
          <button
            type="button"
            className="sb-scripture-note-hide"
            aria-label={t("playlist-scripture-note-hide", {
              defaultValue: "Hide note",
            })}
            onClick={() => (pl.noteHidden.value = true)}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {hasBody && (
          <div className="sb-scripture-note-body">
            <PlayingItem state={state} item={it} />
          </div>
        )}
        <div className="sb-scripture-note-actions">
          {c.index > 0 ? (
            <button
              type="button"
              className="sb-tour-btn sb-tour-btn-back"
              onClick={() => pl.prev()}
            >
              {t("previous", { defaultValue: "Previous" })}
            </button>
          ) : (
            <span />
          )}
          {c.count > 1 && (
            <span className="sb-scripture-note-progress" dir="auto">
              {t("playlist-scripture-note-progress", {
                defaultValue: "{{current}} of {{total}}",
                current: c.index + 1,
                total: c.count,
              })}
            </span>
          )}
          <button
            type="button"
            className="sb-tour-btn sb-tour-btn-next"
            onClick={() => pl.next()}
          >
            {last
              ? t("finish", { defaultValue: "Finish" })
              : t("next", { defaultValue: "Next" })}
            {!last && (
              <span className="sb-tour-next-arrow" dir="ltr" aria-hidden="true">
                {isRtl ? "←" : "→"}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PlaylistFinished({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const id = state.playlists.finished.value;
  const [copy, setCopy] = useState<"copied" | "failed" | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  useEffect(() => {
    setCopy(null);
    setShareUrl(null);
    if (id)
      void sharedLinkOf(
        state.publishing,
        state.discover,
        id,
        location.origin
      ).then(setShareUrl);
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      state.playlists.finished.value = null;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [id]);
  if (!id) return null;
  const playlist = state.playlists.byId(id);
  const close = () => (state.playlists.finished.value = null);
  const share = async () => {
    if (!shareUrl) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: playlist?.label ?? "", url: shareUrl });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };
  const heading = t("playlist-finished-title", {
    defaultValue: "Playlist finished",
  });
  return (
    <div className="sb-footnote-modal-overlay" onClick={close}>
      <div
        className="sb-footnote-modal"
        role="dialog"
        aria-label={heading}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="sb-footnote-modal-header">
          <h3 className="sb-footnote-modal-title">{heading}</h3>
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
          <div className="sb-playlist-finished" dir="auto">
            <p className="sb-playlist-finished-message">
              {t("playlist-finished-message", {
                title: playlist?.label ?? "",
                defaultValue: "You've reached the end of {{title}}.",
              })}
            </p>
            {copy && (
              <p className="sb-playlist-finished-copied" role="status">
                {copy === "copied"
                  ? t("playlist-url-copied", {
                      defaultValue: "Playlist URL copied to clipboard",
                    })
                  : t("playlist-url-copy-failed", {
                      defaultValue: "Couldn't copy the playlist link",
                    })}
              </p>
            )}
            {!shareUrl && !state.publishing.recordOf(id) && (
              <p className="sb-small sb-muted">
                {t("playlist-finished-publish-to-share", {
                  defaultValue:
                    "Publish it from the Library to share it with a link.",
                })}
              </p>
            )}
            <div className="sb-playlist-finished-actions">
              <button type="button" onClick={close}>
                {t("close", { defaultValue: "Close" })}
              </button>
              {shareUrl && (
                <button
                  type="button"
                  className="sb-playlist-finished-share"
                  onClick={() => void share()}
                >
                  {t("share-playlist", { defaultValue: "Share playlist" })}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
