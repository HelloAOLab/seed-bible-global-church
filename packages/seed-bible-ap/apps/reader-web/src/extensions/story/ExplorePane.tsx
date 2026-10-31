// EXPLORE — the ontology drawn whole, a page to wander: the canon as a wheel of its books with the cross-references between
// them (a book opens its canonical sections, a section opens in the reader), who speaks to whom in a book as a network, the
// commissions and plantings on the map of the Bible lands, the churches as one forest, and a search for anyone with a card.
// A name opens its card in the column at the right — family, oikos, generations — as in the Story pane.
import { svgFocusable } from "./svgFocus";
import { signal } from "@preact/signals";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { retryChunkImport } from "../../sw/retryChunkImport";
import { baseMapLayer } from "../locations/PlacesMapPane";
import { placeOf, spanLabel } from "./data";
import { Card, storyFocus, storyTrail } from "./StoryPane";
import { GenerationsDiagram } from "./GenerationsDiagram";
import { nameOf } from "./OikosDiagram";
import type { GenerationNode } from "./data";
import {
  DIVISION_COLOR,
  DIVISIONS,
  divisionOf,
  layoutNetwork,
  readCanon,
  readChurches,
  readFindable,
  readSections,
  readSendings,
  readVoices,
  wheelArcs,
  type AtlasSection,
  type Canon,
  type Churches,
  type Findable,
  type Located,
  type Sendings,
  type Voices,
} from "./atlas";

export const EXPLORE_VIEWS = [
  "canon",
  "voices",
  "sendings",
  "churches",
  "find",
] as const;
export type ExploreView = (typeof EXPLORE_VIEWS)[number];
export const exploreView = signal<ExploreView>("canon");
/** The book the canon and voices views are on (USFM). */
export const exploreBook = signal<string | null>(null);

type Cache = ReaderState["stores"]["chapters"];

export function ExplorePane({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const [card, setCard] = useState<string[]>([]);
  const dark = state.settings.resolvedTheme().id === "dark";
  const cache: Cache = state.stores.chapters;
  const view = exploreView.value;
  const book = exploreBook.value ?? state.reading.bookId.value;
  const open = (path: string | null | undefined) =>
    path && setCard([...card, path]);
  /** Into the reader at a verse, the map of the whole page given back to the chapter. */
  const goTo = (osis: string) => {
    const p = placeOf(osis);
    if (!p) return;
    state.ui.paneWide.value = false;
    void state.reading
      .goTo(state.reading.translationId.value, p.book, p.chapter)
      .then(() => {
        state.selection.select(p.verse, p.verse);
        state.reading.scrollToVerse.value = p.verse;
      });
  };
  /** A canonical section opened beside the chapter, in the Story pane. */
  const openSection = (s: AtlasSection, heading: string) => {
    const a = placeOf(s.from);
    const b = placeOf(s.to);
    if (!a) return;
    state.ui.paneWide.value = false;
    void state.reading
      .goTo(state.reading.translationId.value, a.book, a.chapter)
      .then(() => {
        storyTrail.value = [];
        storyFocus.value = {
          scope: "section",
          chapterRef: `${a.book}.${a.chapter}`,
          heading,
          start: a.verse,
          end: b && b.chapter === a.chapter ? b.verse : 999,
          tab: null,
        };
        state.ui.pane.value = "ext:story" as never;
        state.reading.scrollToVerse.value = a.verse;
      });
  };
  const label: Record<ExploreView, string> = {
    canon: t("explore-canon", { defaultValue: "Canon" }),
    voices: t("explore-voices", { defaultValue: "Voices" }),
    sendings: t("explore-sendings", { defaultValue: "Sendings" }),
    churches: t("explore-churches", { defaultValue: "Churches" }),
    find: t("explore-find", { defaultValue: "Find" }),
  };
  return (
    <div className={`sb-explore${card.length ? " sb-explore-with-card" : ""}`}>
      <div className="sb-explore-main">
        <div className="sb-dcp-filters sb-story-tabs" role="tablist">
          {EXPLORE_VIEWS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={view === k}
              className={`sb-dcp-chip${view === k ? " sb-dcp-chip--active" : ""}`}
              onClick={() => (exploreView.value = k)}
            >
              {label[k]}
            </button>
          ))}
        </div>
        {view === "canon" && (
          <CanonView
            cache={cache}
            book={book}
            onBook={(b) => (exploreBook.value = b)}
            openSection={openSection}
          />
        )}
        {view === "voices" && (
          <VoicesView
            state={state}
            cache={cache}
            book={book}
            onBook={(b) => (exploreBook.value = b)}
            open={open}
          />
        )}
        {view === "sendings" && (
          <SendingsView
            cache={cache}
            dark={dark}
            lang={language}
            open={open}
            goTo={goTo}
          />
        )}
        {view === "churches" && <ChurchesView cache={cache} open={open} />}
        {view === "find" && <FindView cache={cache} open={open} />}
        <p className="sb-small sb-muted sb-story-credit">
          {t("explore-credit", {
            defaultValue:
              "From the scripture and household ontologies (derived by code and models, unreviewed) · cross-references OpenBible.info · Theographic Bible Metadata (CC BY-SA 4.0)",
          })}
        </p>
      </div>
      {card.length > 0 && (
        <aside className="sb-explore-card">
          <Card
            state={state}
            path={card[card.length - 1]!}
            onBack={() => setCard(card.slice(0, -1))}
            onOpen={(p) => setCard([...card, p])}
            goTo={goTo}
            dark={dark}
            lang={language}
          />
        </aside>
      )}
    </div>
  );
}

function useLoad<T>(
  load: () => Promise<T | null>,
  key: string
): T | null | undefined {
  const [v, setV] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setV(undefined);
    void load()
      .then((x) => live && setV(x))
      .catch(() => live && setV(null));
    return () => {
      live = false;
    };
  }, [key]);
  return v;
}

const Loading = () => {
  const { t } = useI18n();
  return (
    <p className="sb-muted sb-small">
      {t("loading", { defaultValue: "Loading…" })}
    </p>
  );
};

/** The canon as a wheel: every book an arc in canon order, sized by its chapters and coloured by its division, and inside it
 *  the strongest cross-references between books. A book draws only its own links; a tap opens its sections. */
function CanonView(props: {
  cache: Cache;
  book: string;
  onBook: (usfm: string) => void;
  openSection: (s: AtlasSection, heading: string) => void;
}) {
  const { t } = useI18n();
  const canon = useLoad<Canon>(() => readCanon(props.cache), "canon");
  const [hover, setHover] = useState<string | null>(null);
  if (canon === undefined) return <Loading />;
  if (!canon)
    return (
      <p className="sb-muted sb-small">
        {t("explore-unreadable", {
          defaultValue: "This could not be read just now.",
        })}
      </p>
    );
  const size = 620;
  const c = size / 2;
  const R = 248;
  const arcs = wheelArcs(canon.books);
  const at = new Map(arcs.map((a) => [a.book.usfm, a]));
  const focus = hover ?? props.book;
  const shown = canon.links
    .filter((l) => l.a === focus || l.b === focus)
    .slice(0, 60);
  const quiet = canon.links.slice(0, 260);
  const most = Math.max(1, ...canon.links.map((l) => l.score));
  const pt = (a: number, r: number) =>
    [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  const arcPath = (a0: number, a1: number, r0: number, r1: number) => {
    const [x0, y0] = pt(a0, r1);
    const [x1, y1] = pt(a1, r1);
    const [x2, y2] = pt(a1, r0);
    const [x3, y3] = pt(a0, r0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
  };
  const chord = (a: string, b: string) => {
    const A = at.get(a);
    const B = at.get(b);
    if (!A || !B) return "";
    const [x0, y0] = pt(A.mid, R - 22);
    const [x1, y1] = pt(B.mid, R - 22);
    return `M${x0},${y0} Q${c},${c} ${x1},${y1}`;
  };
  const book = canon.books.find((b) => b.usfm === props.book);
  return (
    <div className="sb-explore-canon">
      <figure className="sb-explore-wheel">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={t("explore-canon-label", {
            defaultValue:
              "The canon and the cross-references between its books",
          })}
        >
          <g className="sb-explore-chords-quiet">
            {quiet.map((l) => (
              <path
                key={`q${l.a}${l.b}`}
                d={chord(l.a, l.b)}
                style={{ strokeOpacity: 0.04 + (0.18 * l.score) / most }}
              />
            ))}
          </g>
          <g className="sb-explore-chords">
            {shown.map((l) => {
              const other = l.a === focus ? l.b : l.a;
              const color = DIVISION_COLOR[divisionOf(at.get(other)!.book)];
              return (
                <path
                  key={`s${l.a}${l.b}`}
                  d={chord(l.a, l.b)}
                  stroke={color}
                  style={{
                    strokeWidth: 0.6 + (5 * l.score) / (shown[0]?.score || 1),
                  }}
                >
                  <title>{`${at.get(l.a)!.book.name} ↔ ${at.get(l.b)!.book.name}: ${l.count} links`}</title>
                </path>
              );
            })}
          </g>
          {arcs.map((a) => {
            const color = DIVISION_COLOR[divisionOf(a.book)];
            const on = a.book.usfm === focus;
            const [lx, ly] = pt(a.mid, R + 16);
            const deg = (a.mid * 180) / Math.PI;
            const flip = deg > 90 && deg < 270;
            return (
              <g
                key={a.book.usfm}
                className={`sb-explore-book${on ? " sb-explore-book-on" : ""}`}
                role="button"
                {...svgFocusable(true)}
                aria-label={a.book.name}
                onMouseEnter={() => setHover(a.book.usfm)}
                onMouseLeave={() => setHover(null)}
                onClick={() => props.onBook(a.book.usfm)}
                onKeyDown={(e) => {
                  const k = (e as KeyboardEvent).key;
                  if (k === "Enter" || k === " ") {
                    e.preventDefault();
                    props.onBook(a.book.usfm);
                  }
                }}
              >
                <path
                  d={arcPath(a.a0, a.a1, R - 18, on ? R + 4 : R)}
                  fill={color}
                />
                <text
                  x={lx}
                  y={ly}
                  transform={`rotate(${flip ? deg + 180 : deg} ${lx} ${ly})`}
                  textAnchor={flip ? "end" : "start"}
                  dominantBaseline="middle"
                >
                  {a.book.osis}
                </text>
                <title>{`${a.book.name} — ${a.book.chapters ?? "?"} chapters, ${a.book.sections} sections`}</title>
              </g>
            );
          })}
          <text
            x={c}
            y={c - 8}
            textAnchor="middle"
            className="sb-explore-wheel-name"
          >
            {at.get(focus)?.book.name ?? ""}
          </text>
          <text
            x={c}
            y={c + 14}
            textAnchor="middle"
            className="sb-explore-wheel-sub"
          >
            {shown.length
              ? t("explore-canon-links", {
                  count: shown.length,
                  defaultValue: "{{count}} books linked",
                })
              : ""}
          </text>
        </svg>
        <figcaption className="sb-explore-legend">
          {DIVISIONS.map((d) => (
            <span key={d}>
              <i style={{ background: DIVISION_COLOR[d] }} />
              {d.replace(/-/g, " ")}
            </span>
          ))}
        </figcaption>
      </figure>
      {book && (
        <SectionsStrip
          cache={props.cache}
          book={book.usfm}
          name={book.name}
          openSection={props.openSection}
        />
      )}
    </div>
  );
}

/** A book's canonical sections, chapter by chapter, each as wide as its verses, under the BSB headings that label them. */
function SectionsStrip(props: {
  cache: Cache;
  book: string;
  name: string;
  openSection: (s: AtlasSection, heading: string) => void;
}) {
  const { t } = useI18n();
  const data = useLoad(
    () => readSections(props.book, props.cache),
    `sections:${props.book}`
  );
  const groups = useMemo(() => {
    const by = new Map<number, AtlasSection[]>();
    for (const s of data?.sections ?? []) {
      const ch = placeOf(s.from)?.chapter ?? 0;
      by.set(ch, [...(by.get(ch) ?? []), s]);
    }
    return [...by];
  }, [data]);
  if (data === undefined) return <Loading />;
  if (!data?.sections.length) return null;
  const hue = (s: string | null) => {
    let h = 0;
    for (const ch of s ?? "") h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 52%)`;
  };
  const verses = (s: AtlasSection) => {
    const a = placeOf(s.from);
    const b = placeOf(s.to);
    return a && b && a.chapter === b.chapter ? b.verse - a.verse + 1 : 12;
  };
  return (
    <section
      className="sb-explore-sections"
      aria-label={t("explore-sections", {
        name: props.name,
        defaultValue: "The sections of {{name}}",
      })}
    >
      <h4>
        {props.name}{" "}
        <span className="sb-small sb-muted">
          {t("explore-sections-count", {
            count: data.sections.length,
            defaultValue: "{{count}} sections",
          })}
        </span>
      </h4>
      {groups.map(([ch, ss]) => (
        <div key={ch} className="sb-explore-chapter">
          <span className="sb-explore-chapter-n">{ch}</span>
          <div className="sb-explore-chapter-row">
            {ss.map((s) => (
              <button
                key={s.id}
                type="button"
                className="sb-explore-section"
                style={{
                  flexGrow: verses(s),
                  borderTopColor: hue(s.group ?? s.heading),
                }}
                title={`${s.heading ?? ""}${s.group ? ` — ${s.group}` : ""} (${spanLabel(s.from, s.to)})`}
                onClick={() =>
                  props.openSection(s, s.heading ?? spanLabel(s.from, s.to))
                }
              >
                <span>{s.heading ?? spanLabel(s.from, s.to)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Who speaks to whom in a book: each speaker a dot as large as how much they say and hear, each arrow as thick as how often. */
function VoicesView(props: {
  state: ReaderState;
  cache: Cache;
  book: string;
  onBook: (b: string) => void;
  open: (p: string | null) => void;
}) {
  const { t } = useI18n();
  const voices = useLoad<Voices>(
    () => readVoices(props.book, props.cache),
    `voices:${props.book}`
  );
  const [hover, setHover] = useState<string | null>(null);
  const width = 720;
  const height = 520;
  const top = useMemo(() => {
    if (!voices) return null;
    const nodes = [...voices.nodes]
      .sort((a, b) => b.spoke + b.heard - (a.spoke + a.heard))
      .slice(0, 36);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = voices.edges.filter(
      (e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to
    );
    return {
      nodes,
      edges,
      pos: layoutNetwork(
        nodes.map((n) => n.id),
        edges,
        width,
        height
      ),
    };
  }, [voices]);
  const books = props.state.reading.books.value;
  return (
    <div className="sb-explore-voices">
      <label className="sb-small">
        {t("explore-book", { defaultValue: "Book" })}{" "}
        <select
          value={props.book}
          onChange={(e) => props.onBook((e.target as HTMLSelectElement).value)}
        >
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {voices === undefined && <Loading />}
      {top && !top.nodes.length && (
        <p className="sb-muted sb-small">
          {t("explore-no-voices", {
            defaultValue: "No one is recorded speaking in this book yet.",
          })}
        </p>
      )}
      {top && top.nodes.length > 0 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="sb-explore-network"
          role="img"
          aria-label={t("explore-voices-label", {
            defaultValue: "Who speaks to whom",
          })}
        >
          <defs>
            <marker
              id="sb-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className="sb-explore-arrow" />
            </marker>
          </defs>
          {top.edges.map((e) => {
            const a = top.pos.get(e.from)!;
            const b = top.pos.get(e.to)!;
            const on = !hover || hover === e.from || hover === e.to;
            const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.15;
            const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.15;
            return (
              <path
                key={`${e.from}>${e.to}`}
                d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`}
                className="sb-explore-edge"
                markerEnd="url(#sb-arrow)"
                style={{
                  strokeWidth: 0.8 + Math.log2(1 + e.count) * 1.4,
                  opacity: on ? 0.75 : 0.08,
                }}
              >
                <title>{`${e.count}× · ${Object.entries(e.kinds)
                  .map(([k, n]) => `${k} ${n}`)
                  .join(", ")} · first ${e.first}`}</title>
              </path>
            );
          })}
          {top.nodes.map((n) => {
            const p = top.pos.get(n.id)!;
            const r = 5 + Math.sqrt(n.spoke + n.heard) * 2.2;
            const on =
              !hover ||
              hover === n.id ||
              top.edges.some(
                (e) =>
                  (e.from === hover && e.to === n.id) ||
                  (e.to === hover && e.from === n.id)
              );
            return (
              <g
                key={n.id}
                className={`sb-explore-node sb-explore-node-${n.kind}${n.path ? " sb-explore-node-link" : ""}`}
                style={{ opacity: on ? 1 : 0.25 }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => props.open(n.path)}
                role={n.path ? "button" : undefined}
                {...svgFocusable(!!n.path)}
                onKeyDown={(e) => {
                  const k = (e as KeyboardEvent).key;
                  if (n.path && (k === "Enter" || k === " ")) {
                    e.preventDefault();
                    props.open(n.path);
                  }
                }}
              >
                <circle cx={p.x} cy={p.y} r={r} />
                <text x={p.x} y={p.y + r + 12} textAnchor="middle">
                  {nameOf(n.label).length > 22
                    ? `${nameOf(n.label).slice(0, 21)}…`
                    : nameOf(n.label)}
                </text>
                <title>{`${nameOf(n.label)} — spoke ${n.spoke}, addressed ${n.heard}`}</title>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

const OUTCOME_COLOR: Record<string, string> = {
  "as-commanded": "#16a34a",
  elsewhere: "#dc2626",
  refused: "#dc2626",
  delayed: "#ca8a04",
  partial: "#ca8a04",
  exceeded: "#2563eb",
};

/** The commissions and plantings: where each sending went and each church was planted, on the map; and every commission in
 *  canon order — who sent whom, the steps, and how the going answered them (Jonah: went elsewhere). */
function SendingsView(props: {
  cache: Cache;
  dark: boolean;
  lang: string;
  open: (p: string | null) => void;
  goTo: (osis: string) => void;
}) {
  const { t } = useI18n();
  const data = useLoad<Sendings>(() => readSendings(props.cache), "sendings");
  const host = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (!data || !host.current) return;
    let map: import("leaflet").Map | null = null;
    let dead = false;
    void (async () => {
      const L = await retryChunkImport(() => import("leaflet"));
      if (dead || !host.current) return;
      map = L.map(host.current, { zoomControl: true, maxZoom: 12 }).setView(
        [33.5, 36],
        5
      );
      const points = new Map<
        string,
        { place: Located; lines: string[]; planting: boolean }
      >();
      const add = (pl: Located | null, line: string, planting = false) => {
        if (!pl || pl.lat === undefined || pl.lon === undefined) return;
        const e = points.get(pl.id) ?? {
          place: pl,
          lines: [],
          planting: false,
        };
        e.lines.push(line);
        e.planting ||= planting;
        points.set(pl.id, e);
      };
      for (const c of data.commissions)
        for (const s of c.steps) {
          add(
            s.place,
            `${c.by.map((x) => nameOf(x.label)).join(", ")} → ${c.sent.map((x) => nameOf(x.label)).join(", ")}: ${s.message ?? s.kind} (${c.at})`
          );
          for (const j of s.journeys)
            if (j.from?.lat !== undefined && j.to?.lat !== undefined)
              L.polyline(
                [
                  [j.from.lat, j.from.lon!],
                  [j.to.lat, j.to.lon!],
                ],
                {
                  color: OUTCOME_COLOR[j.outcome ?? ""] ?? "#64748b",
                  weight: 3,
                  dashArray: j.outcome === "as-commanded" ? undefined : "6 5",
                }
              )
                .bindTooltip(
                  `${j.traveller.map((x) => nameOf(x.label)).join(", ")}: ${j.from.label} → ${j.to.label}${j.outcome ? ` (${j.outcome})` : ""} · ${j.at}`
                )
                .addTo(map!);
        }
      for (const p of data.plantings)
        add(
          p.place,
          `${p.church.label}, planted by ${p.planters.map((x) => nameOf(x.label)).join(", ")} (${p.at})`,
          true
        );
      const bounds = L.latLngBounds([]);
      for (const { place, lines, planting } of points.values()) {
        L.circleMarker([place.lat!, place.lon!], {
          radius: 5 + Math.min(10, Math.sqrt(lines.length) * 2),
          color: planting ? "#7c3aed" : "#b45309",
          fillColor: planting ? "#a78bfa" : "#f59e0b",
          fillOpacity: 0.85,
          weight: 2,
        })
          .bindTooltip(
            `<strong>${place.label}</strong><br>${lines.slice(0, 6).join("<br>")}${lines.length > 6 ? `<br>+${lines.length - 6} more` : ""}`
          )
          .addTo(map!);
        bounds.extend([place.lat!, place.lon!]);
      }
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15));
      host.current.dataset["drawn"] = String(points.size);
      try {
        (await baseMapLayer(L, null, props.dark, props.lang)).addTo(map);
      } catch {
        /* the sendings stand on a blank map */
      }
    })();
    return () => {
      dead = true;
      map?.remove();
    };
  }, [data, props.dark]);
  if (data === undefined) return <Loading />;
  if (!data) return null;
  const q = filter.trim().toLowerCase();
  const list = data.commissions.filter(
    (c) =>
      !q ||
      [
        c.at,
        ...c.by.map((x) => x.label),
        ...c.sent.map((x) => x.label),
        ...c.steps.map((s) => s.message ?? ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
  );
  return (
    <div className="sb-explore-sendings">
      <div ref={host} className="sb-explore-map" />
      <p className="sb-small sb-muted">
        {t("explore-sendings-legend", {
          commissions: data.commissions.length,
          plantings: data.plantings.length,
          defaultValue:
            "{{commissions}} commissions and {{plantings}} plantings · orange: where someone was sent · purple: a church planted · a line: a journey, dashed when it did not go as commanded",
        })}
      </p>
      <input
        type="search"
        className="sb-explore-search"
        placeholder={t("explore-sendings-filter", {
          defaultValue: "Filter: a name, a place, a book…",
        })}
        value={filter}
        onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
      />
      <ul className="sb-story-list sb-explore-commissions">
        {list.slice(0, 80).map((c, i) => (
          <li key={i}>
            <button
              type="button"
              className="sb-note-button sb-story-ref"
              onClick={() => props.goTo(c.at)}
            >
              {c.at.replace(/\./, " ").replace(/\./, ":")}
            </button>{" "}
            {c.by.map((x) => (
              <Who key={x.id} x={x} open={props.open} />
            ))}{" "}
            →{" "}
            {c.sent.map((x) => (
              <Who key={x.id} x={x} open={props.open} />
            ))}
            <ol className="sb-explore-steps">
              {c.steps.map((s, j) => (
                <li key={j}>
                  <span className="sb-explore-step-kind">{s.kind}</span>{" "}
                  {s.message}
                  {s.place ? ` · ${s.place.label}` : ""}
                  {s.journeys.map((jn, k) => (
                    <span
                      key={k}
                      className="sb-explore-outcome"
                      style={{
                        background:
                          OUTCOME_COLOR[jn.outcome ?? ""] ?? "#64748b",
                      }}
                    >
                      {jn.outcome ?? "went"}
                      {jn.to ? ` → ${jn.to.label}` : ""}
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Who = ({ x, open }: { x: Located; open: (p: string | null) => void }) =>
  x.path ? (
    <button
      type="button"
      className="sb-note-button sb-story-name"
      onClick={() => open(x.path)}
    >
      {nameOf(x.label)}
    </button>
  ) : (
    <span className="sb-story-name sb-story-name-plain">{nameOf(x.label)}</span>
  );

/** The churches as one forest: each planter with the churches they planted, each church with the households it was gathered
 *  from and what it gave rise to; churches whose planting is not recorded stand on their own. */
export function churchForest(data: Churches, label: string): GenerationNode {
  const planters = new Map<string, GenerationNode>();
  const loose: GenerationNode[] = [];
  const churchNode = (c: Churches["churches"][number]): GenerationNode => ({
    id: c.id,
    label: c.label,
    kind: "community",
    path: c.path,
    via: "plantedBody",
    children: [
      ...c.gatheredFrom.map((h) => ({
        ...h,
        kind: "household",
        via: "gatheredFrom" as const,
        children: [],
      })),
      ...c.gaveRiseTo.map((g) => ({
        ...g,
        kind: "community",
        via: "gaveRiseTo" as const,
        children: [],
      })),
    ],
  });
  for (const c of data.churches) {
    if (!c.plantedBy.length) {
      loose.push({ ...churchNode(c), via: undefined });
      continue;
    }
    for (const p of c.plantedBy) {
      const node = planters.get(p.id) ?? {
        ...p,
        kind: "person",
        via: undefined,
        children: [],
      };
      node.children.push(churchNode(c));
      planters.set(p.id, node);
    }
  }
  return {
    id: "root",
    label,
    kind: "root",
    path: null,
    children: [...planters.values(), ...loose],
  };
}

function ChurchesView(props: {
  cache: Cache;
  open: (p: string | null) => void;
}) {
  const { t } = useI18n();
  const data = useLoad<Churches>(() => readChurches(props.cache), "churches");
  if (data === undefined) return <Loading />;
  if (!data) return null;
  return (
    <div className="sb-explore-churches">
      <GenerationsDiagram
        root={churchForest(
          data,
          t("explore-churches-root", { defaultValue: "The churches" })
        )}
        onOpen={(p) => props.open(p)}
      />
    </div>
  );
}

/** Anyone with a card — a person, a place, a household — by name. */
function FindView(props: { cache: Cache; open: (p: string | null) => void }) {
  const { t } = useI18n();
  const all = useLoad<Findable[]>(() => readFindable(props.cache), "findable");
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !all) return [];
    return all
      .filter((x) => x.label.toLowerCase().includes(s))
      .sort(
        (a, b) =>
          Number(!a.label.toLowerCase().startsWith(s)) -
          Number(!b.label.toLowerCase().startsWith(s))
      )
      .slice(0, 40);
  }, [q, all]);
  return (
    <div className="sb-explore-find">
      <input
        type="search"
        className="sb-explore-search"
        placeholder={t("explore-find-placeholder", {
          defaultValue: "A person, a place or a household…",
        })}
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        autoFocus
      />
      {all === undefined && <Loading />}
      <ul className="sb-story-list">
        {hits.map((h) => (
          <li key={h.path}>
            <button
              type="button"
              className="sb-note-button sb-story-name"
              onClick={() => props.open(h.path)}
            >
              {nameOf(h.label)}
            </button>{" "}
            <span className="sb-small sb-muted">
              {h.kind}
              {h.brief ? ` · ${h.brief}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
