// THE DISCOVER CARD — the old reader's DiscoverContentPanel (packages/seed-bible components/DiscoverContentPanel):
// beside the chapter on a wide screen (below it on a phone), "Discover {book}" with + Create, chips for what there
// is (All · Notes · each source: Cross-references, Places, People, places and events…), then those sections. Your
// notes on the chapter and what people released for it are its Notes. It hides when there is nothing to show, and
// while the Discover pane is open (that is the same, larger).
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { DiscoverItem } from "../../extensions/host";
import { noteText } from "../records/noteHtml";
import { OfferingItem } from "./DiscoverPane";

export function DiscoverPanel({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading, ui } = state;
  const chapterRef = reading.chapterRef.value;
  const chapter = reading.chapterData.value;
  const providers = state.extensions.providers.value;
  const [found, setFound] = useState<Record<string, DiscoverItem[]>>({});
  const [filter, setFilter] = useState("all");
  const selected = state.selection.verses.value.join(",");

  useEffect(() => {
    let live = true;
    setFound({});
    for (const p of providers)
      void p
        .discover({
          chapterRef,
          chapter,
          books: reading.books.value,
          selectedVerses: state.selection.verses.value,
        })
        .then((items) => live && setFound((f) => ({ ...f, [p.id]: items })))
        .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [chapterRef, chapter, selected, providers.map((p) => p.id).join()]);

  if (ui.pane.value === "discover" || ui.embed.value) return null;
  const notes = state.annotations.forChapter(chapterRef).value;
  const released = state.discover.forChapter(chapterRef).value?.offerings ?? [];
  const sources = providers.filter((p) => (found[p.id]?.length ?? 0) > 0);
  const hasNotes = notes.length > 0 || released.length > 0;
  if (!hasNotes && !sources.length) return null;

  const chips = [
    { key: "all", label: t("all", { defaultValue: "All" }) },
    ...(hasNotes
      ? [{ key: "notes", label: t("notes", { defaultValue: "Notes" }) }]
      : []),
    ...sources.map((p) => ({ key: p.id, label: p.label })),
  ];
  const f = chips.some((c) => c.key === filter) ? filter : "all";
  const ref = (start: number, end: number) =>
    `${reading.bookName.value} ${reading.chapterNumber.value}:${start === end ? start : `${start}-${end}`}`;

  return (
    <div className="sb-bible-reader-discover-panel">
      <div
        className="sb-discover-content-panel"
        aria-label={t("discover-content-panel", {
          defaultValue: "Discover content",
        })}
      >
        <div className="sb-dcp-header">
          <div className="sb-dcp-header-title">
            <span className="material-symbols-outlined sb-dcp-header-icon">
              explore
            </span>
            <span>
              {t("discover-book-title", {
                book: reading.bookName.value,
                defaultValue: "Discover {{book}}",
              })}
            </span>
          </div>
          <button
            type="button"
            className="sb-dcp-create-btn"
            onClick={() => {
              const v = state.selection.verses.value;
              const start = v.length ? Math.min(...v) : 1;
              const end = v.length ? Math.max(...v) : start;
              ui.noteDraft.value = { start, end };
              ui.pane.value = "notes";
            }}
          >
            + {t("create-playlist", { defaultValue: "Create" })}
          </button>
        </div>
        {chips.length > 2 && (
          <div className="sb-dcp-filters-wrapper">
            <div className="sb-dcp-filters" role="tablist">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={f === c.key}
                  className={`sb-dcp-chip${f === c.key ? " sb-dcp-chip--active" : ""}`}
                  onClick={() => setFilter(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="sb-discover-content-panel-scroll">
          {(f === "all" || f === "notes") && hasNotes && (
            <section className="sb-discover-section">
              <h3 className="sb-discover-section-title">
                {t("notes", { defaultValue: "Notes" })}
              </h3>
              <ul className="sb-discover-list">
                {notes.map((n) => (
                  <li key={n.id} className="sb-discover-item">
                    <button
                      type="button"
                      className="sb-discover-item-main"
                      onClick={() => {
                        ui.pane.value = "notes";
                        ui.focusNoteVerse.value = n.start;
                      }}
                    >
                      <span className="sb-discover-item-content">
                        <span className="sb-discover-item-title">
                          {ref(n.start, n.end)}
                        </span>
                        <span className="sb-discover-item-description">
                          {noteText(n.note).slice(0, 160)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
                {released.map((o) => (
                  <OfferingItem key={o.descriptorId} state={state} o={o} />
                ))}
              </ul>
            </section>
          )}
          {sources
            .filter((p) => f === "all" || f === p.id)
            .map((p) => (
              <section key={p.id} className="sb-discover-section">
                <h3 className="sb-discover-section-title">{p.label}</h3>
                <ul className="sb-discover-list">
                  {(f === "all" ? found[p.id]!.slice(0, 6) : found[p.id]!).map(
                    (it) => (
                      <li
                        key={it.id}
                        className="sb-discover-item sb-discover-item--row"
                      >
                        <button
                          type="button"
                          className="sb-discover-item-main"
                          onClick={() => it.onOpen?.()}
                        >
                          <span className="material-symbols-outlined sb-discover-item-icon">
                            {it.icon ?? "auto_stories"}
                          </span>
                          <span className="sb-discover-item-content">
                            <span className="sb-discover-item-title">
                              {it.title}
                            </span>
                            {it.description && (
                              <span className="sb-discover-item-description">
                                {it.description}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  )}
                </ul>
                {f === "all" && found[p.id]!.length > 6 && (
                  <button
                    type="button"
                    className="sb-content-see-all"
                    onClick={() => setFilter(p.id)}
                  >
                    {t("see-all", { defaultValue: "See all" })}
                  </button>
                )}
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
