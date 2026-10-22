// A SHARED PAGE — the old reader's public page for a shared playlist, plan, note or church theme
// (`/shared/<shelf>/<kind>/<slug>`): its title, who shared it, its text, and what can be done with it — save a
// playlist or plan to your Library and start it, use a theme, read the passage it is about. The edge already drew
// it (worker/index.ts) and left the loaded page in the HTML; without that it is read through the public lane.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { Customization, Playlist, ReadingPlan } from "@seed/seed-schema";
import { SHARED_GLOBAL } from "../../entry-server";
import {
  loadSharedPage,
  markdownBlocks,
  sharedPathOf,
  type SharedPage,
  type SharedRef,
} from "../../state/social/sharedPage";
import { spanOf } from "../../state/records/marks";
import { pushRoute } from "../../state/reading/route";

function seededPage(ref: SharedRef): SharedPage | null {
  const v = (globalThis as Record<string, unknown>)[SHARED_GLOBAL];
  if (!v || typeof v !== "object") return null;
  const p = v as SharedPage;
  return p.shelf === ref.shelf && p.kind === ref.kind && p.slug === ref.slug
    ? p
    : null;
}

export function SharedPageView({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const ref = state.ui.shared.value!;
  const [page, setPage] = useState<SharedPage | null | undefined>(() =>
    seededPage(ref)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (page) return;
    let live = true;
    setPage(undefined);
    loadSharedPage((s, p) => state.backend.readPublic(s, p), ref)
      .then((p) => live && setPage(p))
      .catch(() => live && setPage(null));
    return () => {
      live = false;
    };
  }, [ref.shelf, ref.kind, ref.slug]);

  /** Back to the reader: the URL follows the open chapter again. */
  const close = () => {
    state.ui.shared.value = null;
    const r = state.reading;
    pushRoute({
      translationId: r.translationId.value,
      bookId: r.bookId.value,
      chapterNumber: r.chapterNumber.value,
    });
  };
  const readPassage = async (passage: string) => {
    const [bookId, chapter] = spanOf(passage).chapter.split(".");
    close();
    if (bookId && chapter)
      await state.reading.goTo(
        state.reading.translationId.value,
        bookId,
        Number(chapter)
      );
  };
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const actions = (p: SharedPage) => {
    const out: preact.JSX.Element[] = [];
    const playlist =
      p.kind === "playlist" ? Playlist.safeParse(p.work).data : undefined;
    const plan =
      p.kind === "plan" ? ReadingPlan.safeParse(p.work).data : undefined;
    const theme =
      p.kind === "customization"
        ? Customization.safeParse(p.work).data
        : undefined;
    if (playlist)
      out.push(
        <button
          key="play"
          className="sb-note-button sb-note-button-primary"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const copy = await state.playlists.create(
                playlist.label,
                playlist.hasItem,
                playlist.description
              );
              close();
              state.playlists.play(copy["@id"]);
            })
          }
        >
          {t("shared-save-play", {
            defaultValue: "Save to my Library and play",
          })}
        </button>
      );
    if (plan)
      out.push(
        <button
          key="plan"
          className="sb-note-button sb-note-button-primary"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const copy = await state.plans.create(
                plan.label,
                plan.hasSession.map((s) => ({
                  ...(s.label ? { label: s.label } : {}),
                  items: s.readings.map((r) => r.item),
                })),
                plan.description
              );
              await state.plans.start(copy["@id"]);
              close();
              state.ui.pane.value = "library";
            })
          }
        >
          {t("shared-save-start", {
            defaultValue: "Save to my Library and start",
          })}
        </button>
      );
    if (theme)
      out.push(
        <button
          key="theme"
          className="sb-note-button sb-note-button-primary"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await state.customizations.refresh();
              const entry =
                state.customizations.findByRef(p.descriptorId ?? "") ??
                state.customizations.findByRef(theme["@id"]);
              if (!entry)
                throw new Error(
                  t("shared-theme-missing", {
                    defaultValue:
                      "This theme is not listed yet. Try again in a minute.",
                  })
                );
              await state.customizations.select(entry);
              close();
            })
          }
        >
          {t("shared-use-theme", { defaultValue: "Use this theme" })}
        </button>
      );
    if (p.passage)
      out.push(
        <button
          key="read"
          className="sb-note-button"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              if (p.kind === "note" && p.descriptorId) {
                state.discover.focus.value = p.descriptorId;
                state.ui.pane.value = "discover";
              }
              await readPassage(p.passage!);
            })
          }
        >
          {t("shared-read-passage", {
            defaultValue: "Read {{passage}}",
            passage: p.passage,
          })}
        </button>
      );
    out.push(
      <button
        key="share"
        className="sb-note-button"
        onClick={() =>
          (state.ui.share.value = {
            title: p.title,
            url: `${location.origin}${sharedPathOf(p)}`,
          })
        }
      >
        {t("share", { defaultValue: "Share" })}
      </button>
    );
    return out;
  };

  const kindLabel = (k: SharedRef["kind"]) =>
    k === "note"
      ? t("shared-kind-note", { defaultValue: "Note" })
      : k === "playlist"
        ? t("shared-kind-playlist", { defaultValue: "Playlist" })
        : k === "plan"
          ? t("shared-kind-plan", { defaultValue: "Reading plan" })
          : t("shared-kind-customization", { defaultValue: "Church theme" });

  return (
    <div className="sb-shared-overlay">
      <main
        className="sb-shared-page"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-shared-title"
      >
        <button
          className="sb-shared-close material-symbols-outlined"
          aria-label={t("shared-open-reader", {
            defaultValue: "Open Seed Bible",
          })}
          onClick={close}
        >
          close
        </button>
        {page === undefined && (
          <p className="sb-muted">
            {t("loading", { defaultValue: "Loading…" })}
          </p>
        )}
        {page === null && (
          <>
            <h1 id="sb-shared-title">
              {t("shared-gone", {
                defaultValue: "This page is not shared any more",
              })}
            </h1>
            <p className="sb-muted">
              {t("shared-gone-body", {
                defaultValue:
                  "Whoever shared it may have taken it down, or the link is incomplete.",
              })}
            </p>
          </>
        )}
        {page && (
          <>
            <p className="sb-shared-kind">
              {kindLabel(page.kind)} · {page.shelf}
            </p>
            <h1 id="sb-shared-title">{page.title}</h1>
            <div className="sb-shared-actions">{actions(page)}</div>
            {error && <p className="sb-error sb-small">{error}</p>}
            <div className="sb-shared-body">
              {markdownBlocks(page.markdown).map((b, i) =>
                b.type === "heading" ? (
                  b.level === 1 ? null : (
                    <h2 key={i}>{b.text}</h2>
                  )
                ) : b.type === "list" ? (
                  <ul key={i}>
                    {b.items.map((it, j) => (
                      <li key={j}>{it}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{b.text}</p>
                )
              )}
            </div>
          </>
        )}
        <div className="sb-shared-actions">
          <button className="sb-note-button" onClick={close}>
            {t("shared-open-reader", { defaultValue: "Open Seed Bible" })}
          </button>
        </div>
      </main>
    </div>
  );
}
