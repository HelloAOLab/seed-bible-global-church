// THE STORY PANE — a section of the chapter brought to life from the story layer. The heading toolbar opens it on one
// of six tabs, each named for what the ontology calls it: Scene (scr:Scene — the episode, its time, why it begins here,
// how it is told), Cast (scr:CastEntry — who takes part and in what story role), Setting (scr:sceneSetting — where, on a
// map), Communication (scr:CommunicationAct — who speaks to whom), Events (scr:BiblicalEvent) and Communities
// (at:Community — the churches, nations and tribes attested there). A name with a card opens it in place, Back returns:
// a person's Oikos and Generations, a place's map, a community's planting and what grew out of it, and every scene each
// is in, each a link into the reader.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  gatherSection,
  placeOf,
  readChapterScenes,
  readEntity,
  scenesOfSection,
  spanLabel,
  type CastMember,
  type EntityCard,
  type EntityRef,
  type Scene,
} from "./data";
import { OikosDiagram } from "./OikosDiagram";
import { GenerationsDiagram } from "./GenerationsDiagram";
import { SceneMap } from "./SceneMap";

export const STORY_TABS = [
  "scene",
  "cast",
  "setting",
  "communication",
  "events",
  "communities",
] as const;
export type StoryTab = (typeof STORY_TABS)[number];

/** The section the pane is about and the tab it shows; set by the heading toolbar's tools. */
export const storyFocus = signal<{
  chapterRef: string;
  heading: string;
  start: number;
  end: number;
  tab: StoryTab;
} | null>(null);
/** The cards opened over the tabs, newest last: Back pops one. */
export const storyTrail = signal<string[]>([]);

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

export function StoryPane({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const focus = storyFocus.value;
  const chapterRef = state.reading.chapterRef.value;
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  useEffect(() => {
    let live = true;
    setScenes(null);
    void readChapterScenes(
      state.reading.bookId.value,
      state.reading.chapterNumber.value,
      state.stores.chapters
    )
      .then((s) => live && setScenes(s))
      .catch(() => live && setScenes([]));
    return () => {
      live = false;
    };
  }, [chapterRef]);

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
  if (!focus || focus.chapterRef !== chapterRef)
    return (
      <p className="sb-pane-empty">
        {t("story-empty", {
          defaultValue:
            "Tap a section heading in the chapter, then choose Scene, Cast, Setting, Communication, Events or Communities.",
        })}
      </p>
    );
  if (scenes === null)
    return (
      <p className="sb-muted sb-small">
        {t("loading", { defaultValue: "Loading…" })}
      </p>
    );
  const mine = scenesOfSection(
    scenes,
    state.reading.chapterNumber.value,
    focus.start,
    focus.end
  );
  const all = gatherSection(mine);
  const tabLabel: Record<StoryTab, string> = {
    scene: t("story-tab-scene", { defaultValue: "Scene" }),
    cast: t("story-tab-cast", { defaultValue: "Cast" }),
    setting: t("story-tab-setting", { defaultValue: "Setting" }),
    communication: t("story-tab-communication", {
      defaultValue: "Communication",
    }),
    events: t("story-tab-events", { defaultValue: "Events" }),
    communities: t("story-tab-communities", { defaultValue: "Communities" }),
  };
  const count: Record<StoryTab, number> = {
    scene: mine.length,
    cast: all.cast.length,
    setting: all.places.length,
    communication: all.communication.length,
    events: all.events.length,
    communities: all.communities.length,
  };
  const tab = focus.tab;
  const Name = ({ x }: { x: EntityRef }) =>
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
      <div className="sb-story-head">
        <h3 className="sb-story-heading">{focus.heading}</h3>
        <span className="sb-small sb-muted">
          {state.reading.bookName.value} {state.reading.chapterNumber.value}:
          {focus.start === focus.end
            ? focus.start
            : `${focus.start}–${focus.end}`}
        </span>
      </div>
      <div className="sb-dcp-filters sb-story-tabs" role="tablist">
        {STORY_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`sb-dcp-chip${tab === k ? " sb-dcp-chip--active" : ""}`}
            onClick={() => (storyFocus.value = { ...focus, tab: k })}
          >
            {tabLabel[k]}
            {count[k] ? ` ${count[k]}` : ""}
          </button>
        ))}
      </div>
      {!mine.length && (
        <p className="sb-muted sb-small">
          {t("story-no-scene", {
            defaultValue: "The story layer has no scene for these verses yet.",
          })}
        </p>
      )}
      <div className="sb-story-body" role="tabpanel" aria-label={tabLabel[tab]}>
        {tab === "scene" &&
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
                  <Name x={s.setting} />
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
                    <Name x={c} />
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
              dark={dark}
              lang={language}
              onOpen={open}
            />
            <ul className="sb-story-list">
              {all.places.map((p) => (
                <li key={p.id}>
                  <Name x={p} />
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
        {tab === "events" && (
          <ul className="sb-story-list">
            {all.events.map((e) => (
              <li key={e.label}>
                <strong>{e.label}</strong>
                <div className="sb-small sb-muted">
                  {humanKind(e.kind)}
                  {e.year !== null ? ` · ${yearText(e.year)}` : ""}
                </div>
              </li>
            ))}
            {!all.events.length && (
              <li className="sb-muted sb-small">
                {t("story-no-events", {
                  defaultValue: "No event is recorded for these verses.",
                })}
              </li>
            )}
          </ul>
        )}
        {tab === "communities" && (
          <ul className="sb-story-list">
            {all.communities.map((c) => (
              <li key={c.id}>
                <Name x={c} />
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
      <p className="sb-small sb-muted sb-story-credit">
        {t("story-credit", {
          defaultValue:
            "The story layer (derived by code, unreviewed) · STEPBible, OpenBible.info · Theographic Bible Metadata (CC BY-SA 4.0)",
        })}
      </p>
    </div>
  );
}

const yearText = (y: number) => (y < 0 ? `${-y} BC` : `AD ${y}`);
const humanKind = (k: string) =>
  k === "BiblicalEvent" ? "Event" : k.replace(/([a-z])([A-Z])/g, "$1 $2");

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
                {c.path ? (
                  <button
                    type="button"
                    className="sb-note-button sb-story-name"
                    onClick={() => props.open(c.path!)}
                  >
                    {c.label}
                  </button>
                ) : (
                  <span className="sb-story-name sb-story-name-plain">
                    {c.label}
                  </span>
                )}
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
                        {c.introducedAt.replace(/\./, " ").replace(/\./, ":")}
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

/** One person's, place's or community's card, with its own views. */
function Card(props: {
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
  const [view, setView] = useState<"oikos" | "generations" | "scenes" | "map">(
    "scenes"
  );
  useEffect(() => {
    let live = true;
    setCard(undefined);
    void readEntity(props.path, props.state.stores.chapters)
      .then((c) => {
        if (!live) return;
        setCard(c);
        setView(
          c?.oikos
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
    ["scenes", t("story-view-scenes", { defaultValue: "Scenes" })] as const,
  ].filter(Boolean) as Array<
    readonly ["oikos" | "generations" | "scenes" | "map", string]
  >;
  const Refs = ({ label, xs }: { label: string; xs?: EntityRef[] }) =>
    xs?.length ? (
      <p className="sb-small">
        <span className="sb-rp-section-label">{label}</span>{" "}
        {xs.map((x, i) => (
          <span key={x.id}>
            {i ? ", " : ""}
            {x.path ? (
              <button
                type="button"
                className="sb-note-button sb-story-name"
                onClick={() => props.onOpen(x.path!)}
              >
                {x.label}
              </button>
            ) : (
              x.label
            )}
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
      {view === "oikos" && card.oikos && (
        <OikosDiagram
          name={card.label}
          oikos={card.oikos}
          onOpen={props.onOpen}
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
            {t("story-in-scenes", {
              count: card.sceneCount,
              defaultValue: "In {{count}} scenes",
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
                    {r.replace(/\./, " ").replace(/\./, ":")}
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
