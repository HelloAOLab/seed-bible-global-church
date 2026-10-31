// THE STORY PANE — a section of the chapter, or the whole book, brought to life at the right of the chapter. Tapping a
// section heading ("The Creation") opens it titled by that heading; tapping the chapter title opens it for the book.
// It opens on what has been published about the passage (publishers' teachings and study notes, readers' published
// notes, commentary, videos and articles); where nothing is published, on what the ontology knows instead.
//   a section: Published · Overview (scr:Scene — what happens, when, why it begins here, how it is told) · Cast
//              (scr:CastEntry) · Setting (scr:sceneSetting, on a map) · Communication (scr:CommunicationAct) · Events
//              (scr:BiblicalEvent) · Communities (at:Community)
//   the book:  Published · About (scr:Book and the scr:ContextAssertion claims on it) · Outline (its scenes by chapter) ·
//              People · Places · References (Scripture: the books its cross-references point to and from; Writings: its
//              own time and its copies)
// A name with a card opens it in place, Back returns: a person's Oikos and Generations, a place's map, a community's
// planting and what grew out of it, and every scene each is in, each a link into the reader.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { loadPassage, type PassageItem } from "../../state/passage";
import { Teaching } from "../elsewhere/ContentPane";
import {
  loadPassageWritings,
  type PassageWritingsAnswer,
} from "../interpretations";
import {
  gatherSection,
  loadPublished,
  passageRef,
  placeOf,
  readBook,
  readChapterScenes,
  readEntity,
  scenesOfSection,
  spanLabel,
  type BookCard,
  type CastMember,
  type CrossReferenceBook,
  type EntityCard,
  type EntityRef,
  type PublishedMedia,
  type Scene,
} from "./data";
import { PublishedMediaList } from "../../components/reader/PublishedMediaList";
import { OikosDiagram } from "./OikosDiagram";
import { FamilyTree, familyGenerations } from "./FamilyTree";
import { GenerationsDiagram } from "./GenerationsDiagram";
import { SceneMap } from "./SceneMap";

export const SECTION_TABS = [
  "published",
  "overview",
  "cast",
  "setting",
  "communication",
  "events",
  "communities",
] as const;
export type SectionTab = (typeof SECTION_TABS)[number];
export const BOOK_TABS = [
  "published",
  "about",
  "outline",
  "people",
  "places",
  "references",
] as const;
export type BookTab = (typeof BOOK_TABS)[number];

/** What the pane is about. A null tab is chosen when it opens: Published when something is, else the first view. */
export const storyFocus = signal<
  | {
      scope: "section";
      chapterRef: string;
      heading: string;
      start: number;
      end: number;
      tab: SectionTab | null;
    }
  | { scope: "book"; bookId: string; bookName: string; tab: BookTab | null }
  | null
>(null);
/** The cards opened over the tabs, newest last: Back pops one. */
export const storyTrail = signal<string[]>([]);

/** The pane's title: the heading, or the book. */
export const storyTitle = () => {
  const f = storyFocus.value;
  return f?.scope === "section"
    ? f.heading
    : f?.scope === "book"
      ? f.bookName
      : "Story";
};

/** The kinds of item in a passage answer that are published about it (by a publisher, a reader, a commentator). */
export const PUBLISHED_KINDS = new Set([
  "teaching",
  "study-note",
  "offering",
  "note",
  "commentary",
]);
export const publishedOf = (items: PassageItem[]) =>
  items.filter(
    (i) =>
      PUBLISHED_KINDS.has(i.kind) &&
      (i.source === "publishing" ||
        i.source === "registry" ||
        i.source === "content")
  );

/** What makes a scene begin (scr:SceneBoundaryKind), in words. */
const BOUNDARY: Record<string, string> = {
  "book-start": "The book begins",
  heading: "The edition's heading begins it",
  "place-change": "The place changes",
  "time-change": "The time changes",
  "cast-change": "Someone new comes on stage",
  "speech-exchange": "A new exchange of speech",
  "narrator-comment": "The narrator steps in",
};

const yearText = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);
const humanKind = (k: string) =>
  k === "BiblicalEvent" ? "Event" : k.replace(/([a-z])([A-Z])/g, "$1 $2");
const refText = (osis: string) => osis.replace(/\./, " ").replace(/\./, ":");

export function StoryPane({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const focus = storyFocus.value;
  const goTo = (osis: string) => {
    const p = placeOf(osis);
    if (!p) return;
    void state.reading
      .goTo(state.reading.translationId.value, p.book, p.chapter)
      .then(() => {
        state.selection.select(p.verse, p.verse);
        state.reading.scrollToVerse.value = p.verse;
      });
  };
  const open = (path: string) =>
    (storyTrail.value = [...storyTrail.value, path]);
  const dark = state.settings.resolvedTheme().id === "dark";
  if (storyTrail.value.length)
    return (
      <Card
        state={state}
        path={storyTrail.value[storyTrail.value.length - 1]!}
        onBack={() => (storyTrail.value = storyTrail.value.slice(0, -1))}
        onOpen={open}
        goTo={goTo}
        dark={dark}
        lang={language}
      />
    );
  if (focus?.scope === "book")
    return (
      <BookView
        state={state}
        focus={focus}
        open={open}
        goTo={goTo}
        dark={dark}
        lang={language}
      />
    );
  if (
    focus?.scope === "section" &&
    focus.chapterRef === state.reading.chapterRef.value
  )
    return (
      <SectionView
        state={state}
        focus={focus}
        open={open}
        goTo={goTo}
        dark={dark}
        lang={language}
      />
    );
  return (
    <p className="sb-pane-empty">
      {t("story-empty", {
        defaultValue:
          "Tap a section heading in the chapter, or the chapter's title for the whole book.",
      })}
    </p>
  );
}

interface ViewProps {
  state: ReaderState;
  open: (path: string) => void;
  goTo: (osis: string) => void;
  dark: boolean;
  lang: string;
}

function Tabs<T extends string>(props: {
  tabs: readonly T[];
  tab: T;
  label: Record<T, string>;
  count: Partial<Record<T, number>>;
  onPick: (t: T) => void;
}) {
  return (
    <div className="sb-dcp-filters sb-story-tabs" role="tablist">
      {props.tabs.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={props.tab === k}
          className={`sb-dcp-chip${props.tab === k ? " sb-dcp-chip--active" : ""}`}
          onClick={() => props.onPick(k)}
        >
          {props.label[k]}
          {props.count[k] ? ` ${props.count[k]}` : ""}
        </button>
      ))}
    </div>
  );
}

const Name = ({ x, open }: { x: EntityRef; open: (path: string) => void }) =>
  x.path ? (
    <button
      type="button"
      className="sb-note-button sb-story-name"
      onClick={() => open(x.path!)}
    >
      {x.label}
    </button>
  ) : (
    <span className="sb-story-name sb-story-name-plain">{x.label}</span>
  );

/** What has been published about the passage: videos and articles, publishers' teachings and study notes, readers'
 *  published notes, commentary. */
function Published(props: { media: PublishedMedia[]; items: PassageItem[] }) {
  const { t } = useI18n();
  const teachings = props.items.filter(
    (i) => i.kind === "teaching" || i.kind === "study-note"
  );
  const others = props.items.filter(
    (i) => i.kind !== "teaching" && i.kind !== "study-note"
  );
  return (
    <div className="sb-story-published">
      {props.media.length > 0 && (
        <section>
          <span className="sb-rp-section-label">
            {t("story-videos", { defaultValue: "Videos and articles" })}
          </span>
          <PublishedMediaList media={props.media} />
        </section>
      )}
      {teachings.length > 0 && (
        <section>
          <span className="sb-rp-section-label">
            {t("story-teachings", { defaultValue: "From publishers" })}
          </span>
          <ul className="sb-content-teaching-list">
            {teachings.map((it) => (
              <Teaching key={`${it.title}:${it.locus.ref}`} it={it} />
            ))}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section>
          <span className="sb-rp-section-label">
            {t("story-published-other", {
              defaultValue: "Notes and commentary",
            })}
          </span>
          <ul className="sb-story-list">
            {others.map((it, i) => (
              <li key={i}>
                {it.link ? (
                  <a href={it.link} target="_blank" rel="noreferrer">
                    <strong>{it.title}</strong>
                  </a>
                ) : (
                  <strong>{it.title}</strong>
                )}
                {it.detail && <div className="sb-small">{it.detail}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SectionView(
  props: ViewProps & {
    focus: Extract<NonNullable<typeof storyFocus.value>, { scope: "section" }>;
  }
) {
  const { state, focus, open, goTo } = props;
  const { t } = useI18n();
  const chapterRef = focus.chapterRef;
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [items, setItems] = useState<PassageItem[] | null>(null);
  const [media, setMedia] = useState<PublishedMedia[] | null>(null);
  const key = `${chapterRef}:${focus.start}-${focus.end}`;
  useEffect(() => {
    let live = true;
    setScenes(null);
    setItems(null);
    setMedia(null);
    const [book, ch] = chapterRef.split(".");
    void readChapterScenes(book!, Number(ch), state.stores.chapters)
      .then((s) => live && setScenes(s))
      .catch(() => live && setScenes([]));
    void loadPassage(
      passageRef(chapterRef, focus.start, focus.end),
      state.stores.chapters
    )
      .then((a) => live && setItems(publishedOf(a?.items ?? [])))
      .catch(() => live && setItems([]));
    void loadPublished(
      passageRef(chapterRef, focus.start, focus.end),
      "section",
      state.stores.chapters,
      { edition: state.reading.translationId.value }
    )
      .then((m) => live && setMedia(m ?? []))
      .catch(() => live && setMedia([]));
    return () => {
      live = false;
    };
  }, [key]);
  const published = (items?.length ?? 0) + (media?.length ?? 0);
  const ready = items !== null && media !== null && scenes !== null;
  // Opened without a tab: Published when anything is, else what the story layer knows.
  useEffect(() => {
    if (ready && focus.tab === null)
      storyFocus.value = {
        ...focus,
        tab: published ? "published" : "overview",
      };
  }, [ready, focus.tab]);
  if (!ready || focus.tab === null)
    return (
      <p className="sb-muted sb-small">
        {t("loading", { defaultValue: "Loading…" })}
      </p>
    );
  const mine = scenesOfSection(
    scenes,
    Number(chapterRef.split(".")[1]),
    focus.start,
    focus.end
  );
  const all = gatherSection(mine);
  const label: Record<SectionTab, string> = {
    published: t("story-tab-published", { defaultValue: "Published" }),
    overview: t("story-tab-overview", { defaultValue: "Overview" }),
    cast: t("story-tab-cast", { defaultValue: "Cast" }),
    setting: t("story-tab-setting", { defaultValue: "Setting" }),
    communication: t("story-tab-communication", {
      defaultValue: "Communication",
    }),
    events: t("story-tab-events", { defaultValue: "Events" }),
    communities: t("story-tab-communities", { defaultValue: "Communities" }),
  };
  const count: Record<SectionTab, number> = {
    published,
    overview: 0,
    cast: all.cast.length,
    setting: all.places.length,
    communication: all.communication.length,
    events: all.events.length,
    communities: all.communities.length,
  };
  const tab = focus.tab;
  const VerseLink = ({ from, to }: { from: string; to: string }) => (
    <button
      type="button"
      className="sb-note-button sb-story-ref"
      onClick={() => goTo(from)}
    >
      {spanLabel(from, to)}
    </button>
  );
  return (
    <div className="sb-story" data-section={`${focus.start}-${focus.end}`}>
      <p className="sb-small sb-muted sb-story-where">
        {state.reading.bookName.value} {chapterRef.split(".")[1]}:
        {focus.start === focus.end
          ? focus.start
          : `${focus.start}–${focus.end}`}
      </p>
      <Tabs
        tabs={SECTION_TABS}
        tab={tab}
        label={label}
        count={count}
        onPick={(k) => (storyFocus.value = { ...focus, tab: k })}
      />
      <div className="sb-story-body" role="tabpanel" aria-label={label[tab]}>
        {tab === "published" &&
          (published ? (
            <Published media={media} items={items} />
          ) : (
            <p className="sb-muted sb-small">
              {t("story-nothing-published", {
                defaultValue:
                  "Nothing has been published about these verses yet.",
              })}
            </p>
          ))}
        {tab === "overview" && !mine.length && (
          <p className="sb-muted sb-small">
            {t("story-no-scene", {
              defaultValue: "The story layer has nothing for these verses yet.",
            })}
          </p>
        )}
        {tab === "overview" &&
          mine.map((s) => (
            <section key={s.id} className="sb-story-scene">
              <h4>{s.label}</h4>
              <p className="sb-small sb-muted">
                <VerseLink from={s.from} to={s.to} />
                {s.sceneBoundary
                  ? ` · ${t(`story-boundary-${s.sceneBoundary}`, { defaultValue: BOUNDARY[s.sceneBoundary] ?? s.sceneBoundary })}`
                  : ""}
              </p>
              {s.narrativeTime && (
                <p className="sb-small">
                  <span className="sb-rp-section-label">
                    {t("story-time", { defaultValue: "When" })}
                  </span>{" "}
                  {s.narrativeTime}
                  {s.temporalRelation && s.temporalRelation !== "sequence"
                    ? ` (${s.temporalRelation})`
                    : ""}
                </p>
              )}
              {s.setting && (
                <p className="sb-small">
                  <span className="sb-rp-section-label">
                    {t("story-where", { defaultValue: "Where" })}
                  </span>{" "}
                  <Name x={s.setting} open={open} />
                  {s.setting.brief ? ` — ${s.setting.brief}` : ""}
                </p>
              )}
              <p className="sb-small">
                <span className="sb-rp-section-label">
                  {t("story-on-stage", { defaultValue: "On stage" })}
                </span>{" "}
                {s.cast.map((c, i) => (
                  <span key={c.id}>
                    {i ? ", " : ""}
                    <Name x={c} open={open} />
                  </span>
                ))}
              </p>
              <ModeBar modes={s.narrativeModes} />
              <div className="sb-story-nav">
                {s.previous && (
                  <button
                    type="button"
                    className="sb-note-button"
                    onClick={() => goTo(s.previous!.from)}
                    title={s.previous.label}
                  >
                    ‹ {s.previous.label}
                  </button>
                )}
                {s.next && (
                  <button
                    type="button"
                    className="sb-note-button"
                    onClick={() => goTo(s.next!.from)}
                    title={s.next.label}
                  >
                    {s.next.label} ›
                  </button>
                )}
              </div>
            </section>
          ))}
        {tab === "cast" && <CastList cast={all.cast} open={open} goTo={goTo} />}
        {tab === "setting" && (
          <>
            <SceneMap
              places={all.places.map((p) => ({
                ...p,
                setting: mine.some((s) => s.setting?.id === p.id),
              }))}
              dark={props.dark}
              lang={props.lang}
              onOpen={open}
            />
            <ul className="sb-story-list">
              {all.places.map((p) => (
                <li key={p.id}>
                  <Name x={p} open={open} />
                  {p.modernName && p.modernName !== p.label
                    ? ` (${p.modernName})`
                    : ""}
                  {p.brief ? (
                    <div className="sb-small sb-muted">{p.brief}</div>
                  ) : null}
                </li>
              ))}
            </ul>
            {!all.places.length && (
              <p className="sb-muted sb-small">
                {t("story-no-setting", {
                  defaultValue: "No place is named as the setting here.",
                })}
              </p>
            )}
          </>
        )}
        {tab === "communication" && (
          <ul className="sb-story-list">
            {all.communication.map((c, i) => (
              <li key={i} className="sb-story-act">
                <span className="sb-story-act-who">
                  {c.communicator.join(", ")}
                </span>
                <span
                  className="material-symbols-outlined sb-story-act-arrow"
                  aria-hidden="true"
                >
                  arrow_forward
                </span>
                <span className="sb-story-act-who">
                  {c.audience.length
                    ? c.audience.join(", ")
                    : t("story-no-audience", {
                        defaultValue: "(no one named)",
                      })}
                </span>
                <div className="sb-small sb-muted">
                  {c.mode.join(", ")} ·{" "}
                  <VerseLink from={c.verses[0]} to={c.verses[1]} />
                </div>
              </li>
            ))}
            {!all.communication.length && (
              <li className="sb-muted sb-small">
                {t("story-no-speech", {
                  defaultValue: "No one speaks in these verses; it is told.",
                })}
              </li>
            )}
          </ul>
        )}
        {tab === "events" && <EventList events={all.events} />}
        {tab === "communities" && (
          <ul className="sb-story-list">
            {all.communities.map((c) => (
              <li key={c.id}>
                <Name x={c} open={open} />
              </li>
            ))}
            {!all.communities.length && (
              <li className="sb-muted sb-small">
                {t("story-no-communities", {
                  defaultValue:
                    "No church, nation or tribe is attested in these verses.",
                })}
              </li>
            )}
          </ul>
        )}
      </div>
      <Credit />
    </div>
  );
}

function BookView(
  props: ViewProps & {
    focus: Extract<NonNullable<typeof storyFocus.value>, { scope: "book" }>;
  }
) {
  const { state, focus, open, goTo } = props;
  const { t } = useI18n();
  const [card, setCard] = useState<BookCard | null | undefined>(undefined);
  const [media, setMedia] = useState<PublishedMedia[] | null>(null);
  const [writings, setWritings] = useState<
    PassageWritingsAnswer | null | undefined
  >(undefined);
  const [refs, setRefs] = useState<"scripture" | "writings">("scripture");
  useEffect(() => {
    let live = true;
    setCard(undefined);
    setMedia(null);
    setWritings(undefined);
    void readBook(focus.bookId, state.stores.chapters)
      .then((c) => live && setCard(c))
      .catch(() => live && setCard(null));
    void loadPublished(focus.bookId, "book", state.stores.chapters, {
      edition: state.reading.translationId.value,
    })
      .then((m) => live && setMedia(m ?? []))
      .catch(() => live && setMedia([]));
    void loadPassageWritings(focus.bookId, 1, state.stores.chapters)
      .then((w) => live && setWritings(w))
      .catch(() => live && setWritings(null));
    return () => {
      live = false;
    };
  }, [focus.bookId]);
  const ready = card !== undefined && media !== null;
  useEffect(() => {
    if (ready && focus.tab === null)
      storyFocus.value = {
        ...focus,
        tab: media!.length ? "published" : "about",
      };
  }, [ready, focus.tab]);
  if (!ready || focus.tab === null)
    return (
      <p className="sb-muted sb-small">
        {t("loading", { defaultValue: "Loading…" })}
      </p>
    );
  const label: Record<BookTab, string> = {
    published: t("story-tab-published", { defaultValue: "Published" }),
    about: t("story-tab-about", { defaultValue: "About" }),
    outline: t("story-tab-outline", { defaultValue: "Outline" }),
    people: t("story-tab-people", { defaultValue: "People" }),
    places: t("story-tab-places", { defaultValue: "Places" }),
    references: t("story-tab-references", { defaultValue: "References" }),
  };
  const count: Partial<Record<BookTab, number>> = {
    published: media.length,
    people: card?.people.length,
    places: card?.places.length,
  };
  const tab = focus.tab;
  const bookName = (usfm: string) =>
    state.reading.books.value.find((b) => b.id === usfm)?.name ?? usfm;
  const w = writings?.writings;
  return (
    <div className="sb-story sb-story-book" data-book={focus.bookId}>
      <Tabs
        tabs={BOOK_TABS}
        tab={tab}
        label={label}
        count={count}
        onPick={(k) => (storyFocus.value = { ...focus, tab: k })}
      />
      <div className="sb-story-body" role="tabpanel" aria-label={label[tab]}>
        {tab === "published" &&
          (media.length ? (
            <Published media={media} items={[]} />
          ) : (
            <p className="sb-muted sb-small">
              {t("story-nothing-published-book", {
                defaultValue: "Nothing has been published about this book yet.",
              })}
            </p>
          ))}
        {tab !== "published" && !card && (
          <p className="sb-muted sb-small">
            {t("story-book-unknown", {
              defaultValue: "Nothing is held about this book yet.",
            })}
          </p>
        )}
        {tab === "about" && card && (
          <section className="sb-story-about">
            <p className="sb-small sb-muted">
              {[
                card.testament === "OT"
                  ? "Old Testament"
                  : card.testament === "NT"
                    ? "New Testament"
                    : null,
                ...(card.divisions ?? []),
                card.languages
                  ?.map(
                    (l) =>
                      ({ hbo: "Hebrew", arc: "Aramaic", grc: "Greek" })[l] ?? l
                  )
                  .join(", "),
                card.genres?.join(", "),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {card.purpose && <p>{card.purpose}</p>}
            {card.setting && (
              <p className="sb-small">
                <span className="sb-rp-section-label">
                  {t("story-book-setting", { defaultValue: "Setting" })}
                </span>{" "}
                {card.setting}
              </p>
            )}
            {card.audience && (
              <p className="sb-small">
                <span className="sb-rp-section-label">
                  {t("story-book-audience", { defaultValue: "Audience" })}
                </span>{" "}
                {card.audience}
              </p>
            )}
            {card.claims.length > 0 && (
              <ul className="sb-story-list">
                {card.claims.map((c, i) => (
                  <li key={i}>
                    <span className="sb-rp-section-label">
                      {c.kind}
                      {c.view ? ` · ${c.view}` : ""}
                    </span>
                    <div>{c.content}</div>
                    <div className="sb-small sb-muted">
                      {[c.source, c.sourceDate].filter(Boolean).join(", ")}
                      {/draft|review/i.test(c.by ?? "")
                        ? ` · ${t("story-claim-unreviewed", { defaultValue: "a draft, not yet reviewed" })}`
                        : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {tab === "outline" && card && (
          <div className="sb-story-outline">
            {card.outline.map((c) => (
              <details
                key={c.chapter}
                open={c.chapter === state.reading.chapterNumber.value}
              >
                <summary>
                  {t("story-chapter", {
                    chapter: c.chapter,
                    defaultValue: "Chapter {{chapter}}",
                  })}{" "}
                  <span className="sb-small sb-muted">({c.scenes.length})</span>
                </summary>
                <ul className="sb-story-list">
                  {c.scenes.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="sb-note-button sb-story-ref"
                        onClick={() => goTo(s.from)}
                      >
                        {spanLabel(s.from, s.to)}
                      </button>{" "}
                      {s.label}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
        {tab === "people" && card && (
          <ul className="sb-story-list">
            {card.people.map((p) => (
              <li key={p.id}>
                <Name x={p} open={open} />
                <div className="sb-small sb-muted">
                  {[p.roles.join(", "), p.brief].filter(Boolean).join(" · ")} ·{" "}
                  {t("story-in-n-scenes", {
                    count: p.scenes,
                    defaultValue: "in {{count}} scenes",
                  })}{" "}
                  ·{" "}
                  <button
                    type="button"
                    className="sb-note-button sb-story-ref"
                    onClick={() => goTo(p.firstAt)}
                  >
                    {refText(p.firstAt)}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab === "places" && card && (
          <>
            <SceneMap
              places={card.places}
              dark={props.dark}
              lang={props.lang}
              onOpen={open}
            />
            <ul className="sb-story-list">
              {card.places.map((p) => (
                <li key={p.id}>
                  <Name x={p} open={open} />{" "}
                  <span className="sb-small sb-muted">
                    {t("story-in-n-scenes", {
                      count: p.scenes,
                      defaultValue: "in {{count}} scenes",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === "references" && (
          <>
            <div className="sb-story-subtabs" role="tablist">
              {(["scripture", "writings"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={refs === k}
                  className={`sb-dcp-chip${refs === k ? " sb-dcp-chip--active" : ""}`}
                  onClick={() => setRefs(k)}
                >
                  {k === "scripture"
                    ? t("story-refs-scripture", { defaultValue: "Scripture" })
                    : t("story-refs-writings", { defaultValue: "Writings" })}
                </button>
              ))}
            </div>
            {refs === "scripture" && card?.references && (
              <>
                <CrossBooks
                  title={t("story-refs-out", {
                    book: focus.bookName,
                    defaultValue: "{{book}} points to",
                  })}
                  rows={card.references.out}
                  bookName={bookName}
                  goTo={goTo}
                  pairFrom
                />
                <CrossBooks
                  title={t("story-refs-in", {
                    book: focus.bookName,
                    defaultValue: "Pointing to {{book}}",
                  })}
                  rows={card.references.in}
                  bookName={bookName}
                  goTo={goTo}
                  pairFrom={false}
                />
                <p className="sb-small sb-muted">
                  {t("story-refs-credit", {
                    count: card.references.within,
                    defaultValue:
                      "{{count}} more within the book · cross-references: OpenBible.info (CC BY 4.0)",
                  })}
                </p>
              </>
            )}
            {refs === "writings" && (
              <>
                {writings === undefined && (
                  <p className="sb-muted sb-small">
                    {t("loading", { defaultValue: "Loading…" })}
                  </p>
                )}
                {w?.window?.ceilingText && (
                  <p className="sb-small">
                    <span className="sb-rp-section-label">
                      {t("story-book-time", { defaultValue: "Its own time" })}
                    </span>{" "}
                    {w.window.ceilingText} — {w.window.basis}
                  </p>
                )}
                {w?.witnesses.ofBook.length ? (
                  <>
                    <span className="sb-rp-section-label">
                      {t("story-book-copies", { defaultValue: "Its copies" })}
                    </span>
                    <ul className="sb-story-list">
                      {w.witnesses.ofBook.map((c) => (
                        <li key={c.id}>
                          {c.links[0] ? (
                            <a
                              href={c.links[0].url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {c.title}
                            </a>
                          ) : (
                            c.title
                          )}
                          <div className="sb-small sb-muted">
                            {[c.kind, c.date].filter(Boolean).join(" · ")}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : writings !== undefined ? (
                  <p className="sb-muted sb-small">
                    {t("story-book-no-copies", {
                      defaultValue: "No copy of the book is recorded yet.",
                    })}
                  </p>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
      <Credit />
    </div>
  );
}

function CrossBooks(props: {
  title: string;
  rows: CrossReferenceBook[];
  bookName: (usfm: string) => string;
  goTo: (osis: string) => void;
  /** Whether the strongest pair is read from this book's verse (points to) or from the other book's (pointing to). */
  pairFrom: boolean;
}) {
  const { t } = useI18n();
  if (!props.rows.length) return null;
  const top = props.rows.slice(0, 12);
  const most = Math.max(...top.map((r) => r.score), 1);
  return (
    <section className="sb-story-xbooks">
      <span className="sb-rp-section-label">{props.title}</span>
      <ul className="sb-story-list">
        {top.map((r) => {
          const p = r.top[0];
          const there = p ? (props.pairFrom ? p.to : p.from) : null;
          const here = p ? (props.pairFrom ? p.from : p.to) : null;
          return (
            <li key={r.book}>
              <div className="sb-story-xbook">
                <strong>{props.bookName(r.book)}</strong>
                <span
                  className="sb-story-xbar"
                  style={{ width: `${Math.max(4, (100 * r.score) / most)}%` }}
                />
                <span className="sb-small sb-muted">
                  {t("story-refs-count", {
                    count: r.count,
                    defaultValue: "{{count}} links",
                  })}
                </span>
              </div>
              {p && here && there && (
                <div className="sb-small">
                  {t("story-refs-strongest", { defaultValue: "Strongest:" })}{" "}
                  <button
                    type="button"
                    className="sb-note-button sb-story-ref"
                    onClick={() => props.goTo(here)}
                  >
                    {refText(here)}
                  </button>{" "}
                  ↔{" "}
                  <button
                    type="button"
                    className="sb-note-button sb-story-ref"
                    onClick={() => props.goTo(there)}
                  >
                    {refText(there)}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EventList({
  events,
}: {
  events: Array<{ label: string; kind: string; year: number | null }>;
}) {
  const { t } = useI18n();
  return (
    <ul className="sb-story-list">
      {events.map((e) => (
        <li key={e.label}>
          <strong>{e.label}</strong>
          <div className="sb-small sb-muted">
            {humanKind(e.kind)}
            {e.year !== null ? ` · ${yearText(e.year)}` : ""}
          </div>
        </li>
      ))}
      {!events.length && (
        <li className="sb-muted sb-small">
          {t("story-no-events", {
            defaultValue: "No event is recorded for these verses.",
          })}
        </li>
      )}
    </ul>
  );
}

function Credit() {
  const { t } = useI18n();
  return (
    <p className="sb-small sb-muted sb-story-credit">
      {t("story-credit", {
        defaultValue:
          "The story layer (derived by code, unreviewed) · STEPBible, OpenBible.info · Theographic Bible Metadata (CC BY-SA 4.0)",
      })}
    </p>
  );
}

/** How the section is told: narration, speech, prayer, song … as a bar in proportion. */
function ModeBar({ modes }: { modes: Record<string, number> }) {
  const total = Object.values(modes).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <div className="sb-story-modes" aria-label="How it is told">
      {Object.entries(modes)
        .sort((a, b) => b[1] - a[1])
        .map(([m, n]) => (
          <span
            key={m}
            className={`sb-story-mode sb-story-mode-${m}`}
            style={{ flexGrow: n }}
            title={`${m}: ${n}`}
          >
            {m}
          </span>
        ))}
    </div>
  );
}

function CastList(props: {
  cast: CastMember[];
  open: (path: string) => void;
  goTo: (osis: string) => void;
}) {
  const byRole = new Map<string, CastMember[]>();
  for (const c of props.cast) {
    const r = c.storyRole ?? "other";
    byRole.set(r, [...(byRole.get(r) ?? []), c]);
  }
  return (
    <div className="sb-story-cast">
      {[...byRole].map(([role, members]) => (
        <section key={role}>
          <span className="sb-rp-section-label">{role.replace(/-/g, " ")}</span>
          <ul className="sb-story-list">
            {members.map((c) => (
              <li key={c.id}>
                <Name x={c} open={props.open} />
                <div className="sb-small sb-muted">
                  {[
                    c.naturalGender,
                    c.naturalNumber === "many" ? "a group" : null,
                    c.brief,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {c.introducedAt && (
                    <>
                      {" · first in "}
                      <button
                        type="button"
                        className="sb-note-button sb-story-ref"
                        onClick={() => props.goTo(c.introducedAt!)}
                      >
                        {refText(c.introducedAt)}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Whether a person's ties hold any family at all (Paul's hold none; Jacob's four generations). */
const hasFamily = (o: NonNullable<EntityCard["oikos"]>) =>
  familyGenerations(o).some((g) => g.line.length || g.others.length);

/** One person's, place's or community's card, with its own views. */
export function Card(props: {
  state: ReaderState;
  path: string;
  onBack: () => void;
  onOpen: (path: string) => void;
  goTo: (osis: string) => void;
  dark: boolean;
  lang: string;
}) {
  const { t } = useI18n();
  const [card, setCard] = useState<EntityCard | null | undefined>(undefined);
  const [view, setView] = useState<
    "family" | "oikos" | "generations" | "scenes" | "map"
  >("scenes");
  useEffect(() => {
    let live = true;
    setCard(undefined);
    void readEntity(props.path, props.state.stores.chapters)
      .then((c) => {
        if (!live) return;
        setCard(c);
        setView(
          c?.oikos && hasFamily(c.oikos)
            ? "family"
            : c?.oikos
              ? "oikos"
              : c?.generations
                ? "generations"
                : typeof c?.lat === "number"
                  ? "map"
                  : "scenes"
        );
      })
      .catch(() => live && setCard(null));
    return () => {
      live = false;
    };
  }, [props.path]);
  const back = (
    <button
      type="button"
      className="sb-note-button sb-theo-back"
      onClick={props.onBack}
    >
      {t("back", { defaultValue: "Back" })}
    </button>
  );
  if (card === undefined)
    return (
      <div className="sb-story-card">
        {back}
        <p className="sb-muted sb-small">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      </div>
    );
  if (card === null)
    return (
      <div className="sb-story-card">
        {back}
        <p className="sb-muted sb-small">
          {t("story-card-unreadable", {
            defaultValue: "This record could not be read.",
          })}
        </p>
      </div>
    );
  const views = [
    card.oikos && hasFamily(card.oikos)
      ? ([
          "family",
          t("story-view-family", { defaultValue: "Family" }),
        ] as const)
      : null,
    card.oikos
      ? (["oikos", t("story-view-oikos", { defaultValue: "Oikos" })] as const)
      : null,
    card.generations
      ? ([
          "generations",
          t("story-view-generations", { defaultValue: "Generations" }),
        ] as const)
      : null,
    typeof card.lat === "number"
      ? (["map", t("story-view-map", { defaultValue: "Map" })] as const)
      : null,
    [
      "scenes",
      t("story-view-appears", { defaultValue: "Appears in" }),
    ] as const,
  ].filter(Boolean) as Array<
    readonly ["family" | "oikos" | "generations" | "scenes" | "map", string]
  >;
  const Refs = ({ label, xs }: { label: string; xs?: EntityRef[] }) =>
    xs?.length ? (
      <p className="sb-small">
        <span className="sb-rp-section-label">{label}</span>{" "}
        {xs.map((x, i) => (
          <span key={x.id}>
            {i ? ", " : ""}
            <Name x={x} open={props.onOpen} />
          </span>
        ))}
      </p>
    ) : null;
  return (
    <div className="sb-story-card" data-entity={card.id}>
      {back}
      <h3 className="sb-theo-name">{card.label}</h3>
      <p className="sb-small sb-muted">
        {[
          card.kind === "community"
            ? card.type === "Community"
              ? "community"
              : card.type?.toLowerCase()
            : card.kind,
          card.gender,
          card.period,
          card.modernName && card.modernName !== card.label
            ? `today ${card.modernName}`
            : null,
          card.occurrences ? `named ${card.occurrences} times` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {card.brief && <p>{card.brief}</p>}
      <Refs
        label={t("story-planted-by", { defaultValue: "Planted by" })}
        xs={card.plantedBy}
      />
      <Refs
        label={t("story-grew-out-of", { defaultValue: "Grew out of" })}
        xs={card.grewOutOf?.filter(
          (x) => !card.plantedBy?.some((p) => p.id === x.id)
        )}
      />
      <Refs
        label={t("story-gave-rise-to", { defaultValue: "Gave rise to" })}
        xs={card.gaveRiseTo}
      />
      <Refs
        label={t("story-household-head", { defaultValue: "Head" })}
        xs={card.head}
      />
      <Refs
        label={t("story-household-members", { defaultValue: "Members" })}
        xs={card.members}
      />
      <Refs
        label={t("story-gathered-as", { defaultValue: "Became" })}
        xs={card.gatheredAs}
      />
      <Refs
        label={t("story-gathered-from", { defaultValue: "Gathered from" })}
        xs={card.gatheredFrom}
      />
      <div className="sb-dcp-filters sb-story-tabs" role="tablist">
        {views.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            className={`sb-dcp-chip${view === k ? " sb-dcp-chip--active" : ""}`}
            onClick={() => setView(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "family" && card.oikos && (
        <FamilyTree
          name={card.label}
          oikos={card.oikos}
          onOpen={props.onOpen}
        />
      )}
      {view === "oikos" && card.oikos && (
        <OikosDiagram
          name={card.label}
          oikos={card.oikos}
          source={card.kinshipSource}
          ties={card.ties}
          onOpen={props.onOpen}
          goTo={props.goTo}
        />
      )}
      {view === "generations" && card.generations && (
        <GenerationsDiagram root={card.generations} onOpen={props.onOpen} />
      )}
      {view === "map" && (
        <SceneMap
          places={[
            {
              id: card.id,
              label: card.label,
              kind: card.kind,
              path: null,
              lat: card.lat,
              lon: card.lon,
              modernName: card.modernName,
              setting: true,
            },
          ]}
          dark={props.dark}
          lang={props.lang}
          onOpen={props.onOpen}
        />
      )}
      {view === "scenes" && (
        <>
          <p className="sb-small sb-muted">
            {t("story-in-passages", {
              count: card.sceneCount,
              defaultValue: "In {{count}} passages",
            })}
            {card.sceneCount > card.scenes.length
              ? ` (${card.scenes.length} shown)`
              : ""}
          </p>
          <ul className="sb-story-list">
            {card.scenes.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="sb-note-button sb-story-ref"
                  onClick={() => props.goTo(s.from)}
                >
                  {s.from.split(".")[0]} {spanLabel(s.from, s.to)}
                </button>{" "}
                {s.label}
                {s.storyRole && s.storyRole !== "setting" ? (
                  <span className="sb-small sb-muted"> · {s.storyRole}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {card.attestedAt?.length ? (
            <p className="sb-small">
              <span className="sb-rp-section-label">
                {t("story-attested-at", { defaultValue: "Attested at" })}
              </span>{" "}
              {card.attestedAt.map((r, i) => (
                <span key={r}>
                  {i ? ", " : ""}
                  <button
                    type="button"
                    className="sb-note-button sb-story-ref"
                    onClick={() => props.goTo(r)}
                  >
                    {refText(r)}
                  </button>
                </span>
              ))}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
