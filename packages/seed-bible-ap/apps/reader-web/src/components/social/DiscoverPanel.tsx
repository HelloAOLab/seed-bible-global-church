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
import { ContentCards, byAuthor } from "./ContentCards";

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
  }, [
    chapterRef,
    chapter,
    selected,
    providers.map((p) => p.id).join(),
    state.extensions.settings.value,
  ]);

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
            onClick={() => createNote(state)}
          >
            + {t("create-playlist", { defaultValue: "Create" })}
          </button>
          <button
            type="button"
            className="sb-dcp-hide-btn"
            aria-label={t("discover-panel-hide", {
              defaultValue: "Hide Discover",
            })}
            title={t("discover-panel-hide", { defaultValue: "Hide Discover" })}
            onClick={() => {
              state.settings.showDiscovered.value = false;
              ui.toast.value = { key: "discover-hidden" };
            }}
          >
            <span className="material-symbols-outlined">close</span>
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
            <ChapterNotes state={state} />
          )}
          {sources
            .filter((p) => f === "all" || f === p.id)
            .map((p) => {
              const { groups, rest } = byAuthor(found[p.id]!);
              return groups.length > 0 ? (
                <div key={p.id}>
                  <ContentCards
                    groups={groups}
                    {...(f === "all" ? { limit: 3 } : {})}
                  />
                  {f === "all" && found[p.id]!.length > 3 * groups.length && (
                    <button
                      type="button"
                      className="sb-content-see-all"
                      onClick={() => setFilter(p.id)}
                    >
                      {t("see-all", { defaultValue: "See all" })}
                    </button>
                  )}
                  {rest.length > 0 && <ItemRows items={rest} />}
                </div>
              ) : (
                <ProviderRows
                  key={p.id}
                  title={p.label}
                  items={found[p.id]!}
                  all={f === "all"}
                  onSeeAll={() => setFilter(p.id)}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}

/** Start a note on the chosen verses (else verse 1), in the Notes pane — the old reader's Create a note. */
export function createNote(state: ReaderState) {
  const v = state.selection.verses.value;
  const start = v.length ? Math.min(...v) : 1;
  const end = v.length ? Math.max(...v) : start;
  state.ui.noteDraft.value = { start, end };
  state.ui.pane.value = "notes";
}

/**
 * NOTES for the chapter on screen, the old reader's first Discover section: yours, and what people shared for it. With
 * `empty`, an empty chapter says so and offers Create a note (the Discover pane); without, it renders nothing (the card).
 */
export function ChapterNotes({
  state,
  empty,
}: {
  state: ReaderState;
  empty?: boolean;
}) {
  const { t } = useI18n();
  const { reading, ui } = state;
  const chapterRef = reading.chapterRef.value;
  const notes = state.annotations.forChapter(chapterRef).value;
  const released = state.discover.forChapter(chapterRef).value?.offerings ?? [];
  if (!notes.length && !released.length && !empty) return null;
  const ref = (start: number, end: number) =>
    `${reading.bookName.value} ${reading.chapterNumber.value}:${start === end ? start : `${start}-${end}`}`;
  return (
    <section className="sb-discover-section">
      <h3 className="sb-discover-section-title">
        {t("notes", { defaultValue: "Notes" })}
      </h3>
      {!notes.length && !released.length ? (
        <p className="sb-discover-empty">
          {t("discover-no-notes", {
            defaultValue: "You don't have any notes for this chapter.",
          })}{" "}
          <button
            type="button"
            className="sb-discover-create-link"
            onClick={() => createNote(state)}
          >
            {t("create-a-note", { defaultValue: "Create a note" })}
          </button>
        </p>
      ) : (
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
      )}
    </section>
  );
}

function ItemRows({ items }: { items: DiscoverItem[] }) {
  return (
    <ul className="sb-discover-list">
      {items.map((it) => (
        <li key={it.id} className="sb-discover-item sb-discover-item--row">
          <button
            type="button"
            className="sb-discover-item-main"
            onClick={() => it.onOpen?.()}
          >
            <span className="material-symbols-outlined sb-discover-item-icon">
              {it.icon ?? "auto_stories"}
            </span>
            <span className="sb-discover-item-content">
              <span className="sb-discover-item-title">{it.title}</span>
              {it.description && (
                <span className="sb-discover-item-description">
                  {it.description}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A source's own section names, in the reader's language. */
function sectionName(t: ReturnType<typeof useI18n>["t"], name: string) {
  switch (name) {
    case "People":
      return t("discover-people", { defaultValue: "People" });
    case "Places":
      return t("discover-places", { defaultValue: "Places" });
    case "Events":
      return t("discover-events", { defaultValue: "Events" });
    case "Old Testament":
      return t("old-testament", { defaultValue: "Old Testament" });
    case "New Testament":
      return t("new-testament", { defaultValue: "New Testament" });
    default:
      return name;
  }
}

/** One of a source's sections: its name and how many, folding away (the old reader's). */
function FoldingSection(props: { title: string; items: DiscoverItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [all, setAll] = useState(false);
  // Five at first, then "Show all N": a section of fifty-three scroll lines must not bury the next one.
  const FIRST = 5;
  return (
    <section className="sb-discover-section sb-discover-fold">
      <button
        type="button"
        className="sb-annotation-group-header"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="sb-annotation-group-header-title">
          {sectionName(t, props.title)}{" "}
          <span className="sb-discover-fold-count">{props.items.length}</span>
        </span>
        <span
          className={`material-symbols-outlined sb-annotation-group-header-icon${open ? "" : " sb-annotation-group-header-icon--collapsed"}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {open && (
        <ItemRows items={all ? props.items : props.items.slice(0, FIRST)} />
      )}
      {open && props.items.length > FIRST && (
        <button
          type="button"
          className="sb-content-see-all sb-discover-show-all"
          onClick={() => setAll(!all)}
        >
          {all
            ? t("show-fewer", { defaultValue: "Show fewer" })
            : t("show-all-count", {
                count: props.items.length,
                defaultValue: "Show all {{count}}",
              })}
        </button>
      )}
    </section>
  );
}

/** A source's items split by their section, when they name one. */
export function SectionedRows({ items }: { items: DiscoverItem[] }) {
  const order: string[] = [];
  const by = new Map<string, DiscoverItem[]>();
  for (const it of items) {
    const k = it.section ?? "";
    if (!by.has(k)) order.push(k);
    by.set(k, [...(by.get(k) ?? []), it]);
  }
  return (
    <>
      {order.map((k) =>
        k ? (
          <FoldingSection key={k} title={k} items={by.get(k)!} />
        ) : (
          <ItemRows key="rest" items={by.get(k)!} />
        )
      )}
    </>
  );
}

/** A source's section: its rows, six at first with See all. */
function ProviderRows(props: {
  title: string;
  items: DiscoverItem[];
  all: boolean;
  onSeeAll: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="sb-discover-section">
      <h3 className="sb-discover-section-title">{props.title}</h3>
      {props.items.some((it) => it.section) ? (
        <SectionedRows
          items={props.all ? props.items.slice(0, 12) : props.items}
        />
      ) : (
        <ItemRows items={props.all ? props.items.slice(0, 6) : props.items} />
      )}
      {props.all &&
        props.items.length >
          (props.items.some((it) => it.section) ? 12 : 6) && (
          <button
            type="button"
            className="sb-content-see-all"
            onClick={props.onSeeAll}
          >
            {t("see-all", { defaultValue: "See all" })}
          </button>
        )}
    </section>
  );
}
