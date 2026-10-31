// THE OIKOS — a person at the centre of their web of relationships, in rings by closeness (the operations' oikos map, for
// a person of the Bible): the household nearest (parents, partners, children, siblings), then the extended family
// (grandparents, grandchildren, aunts and uncles, nieces and nephews, cousins, in-laws), then the people they walked with
// (companions, those they discipled, who discipled them), then the bodies they belonged to or planted (tribe,
// communities). A relative holding two ties is drawn once, in the nearer ring, and named with both (Laban: uncle,
// father-in-law). The legend turns a ring on or off; under the rings every tie is listed by kind, with its source.
import { svgFocusable } from "./svgFocus";
import { useState } from "preact/hooks";
import { useI18n } from "../../i18n";
import type { EntityRef, Oikos, OikosTie } from "./data";

type TieKey = Exclude<keyof Oikos, never>;
export type RingKey = "household" | "extended" | "walked-with" | "bodies";

/** Every kind of tie: the ring it belongs to and what it is called. */
export const TIES: Array<{ key: TieKey; ring: RingKey; label: string }> = [
  { key: "parents", ring: "household", label: "parent" },
  { key: "partners", ring: "household", label: "spouse" },
  { key: "children", ring: "household", label: "child" },
  { key: "siblings", ring: "household", label: "sibling" },
  { key: "grandparents", ring: "extended", label: "grandparent" },
  { key: "grandchildren", ring: "extended", label: "grandchild" },
  { key: "auntsUncles", ring: "extended", label: "aunt or uncle" },
  { key: "niecesNephews", ring: "extended", label: "niece or nephew" },
  { key: "parentsInLaw", ring: "extended", label: "parent-in-law" },
  { key: "childrenInLaw", ring: "extended", label: "child-in-law" },
  { key: "siblingsInLaw", ring: "extended", label: "sibling-in-law" },
  { key: "cousins", ring: "extended", label: "cousin" },
  { key: "discipledBy", ring: "walked-with", label: "discipled them" },
  { key: "companions", ring: "walked-with", label: "companion" },
  { key: "discipled", ring: "walked-with", label: "discipled" },
  { key: "hostedBy", ring: "walked-with", label: "hosted by" },
  { key: "hosted", ring: "walked-with", label: "hosted" },
  { key: "households", ring: "bodies", label: "household" },
  { key: "tribe", ring: "bodies", label: "tribe" },
  { key: "memberOf", ring: "bodies", label: "member of" },
  { key: "planted", ring: "bodies", label: "planted" },
];
const RINGS: Array<{ key: RingKey; label: string; max: number }> = [
  { key: "household", label: "Household", max: 12 },
  { key: "extended", label: "Extended family", max: 18 },
  { key: "walked-with", label: "Walked with", max: 12 },
  { key: "bodies", label: "Bodies", max: 10 },
];

/** A name as people read it: the knowledge base keeps some with underscores (`a_wife_of_Simeon`). */
export const nameOf = (label: string) => label.replace(/_/g, " ");

export interface RingMember extends EntityRef {
  /** Every tie this person holds to the one at the centre, nearest first. */
  relations: string[];
}

/** The rings, each person once in the nearest ring that holds them, with all their ties; empty rings are left out. */
export function oikosRings(o: Oikos) {
  const placed = new Map<string, { ring: RingKey; m: RingMember }>();
  for (const t of TIES)
    for (const x of o[t.key] ?? []) {
      const hit = placed.get(x.id);
      if (hit) {
        if (!hit.m.relations.includes(t.label)) hit.m.relations.push(t.label);
      } else
        placed.set(x.id, { ring: t.ring, m: { ...x, relations: [t.label] } });
    }
  return RINGS.map((r) => {
    const all = [...placed.values()]
      .filter((p) => p.ring === r.key)
      .map((p) => p.m);
    return {
      key: r.key,
      label: r.label,
      shown: all.slice(0, r.max),
      more: Math.max(0, all.length - r.max),
    };
  }).filter((r) => r.shown.length);
}

export function OikosDiagram(props: {
  name: string;
  oikos: Oikos;
  source?: string | null;
  ties?: OikosTie[];
  onOpen: (path: string) => void;
  goTo: (osis: string) => void;
}) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState<Set<RingKey>>(new Set());
  const all = oikosRings(props.oikos).map((r) => ({
    ...r,
    label: t(`story-oikos-${r.key}`, { defaultValue: r.label }),
  }));
  if (!all.length)
    return (
      <p className="sb-muted sb-small">
        {t("story-oikos-none", {
          defaultValue: "No relationships are recorded.",
        })}
      </p>
    );
  const rings = all.filter((r) => !hidden.has(r.key));
  const size = 400;
  const c = size / 2;
  // The rings drawn share the space from the centre to the edge, so a family of two rings is not crowded at the middle.
  const radius = (i: number) =>
    rings.length < 2 ? 110 : 76 + (i * 104) / (rings.length - 1);
  const toggle = (k: RingKey) => {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setHidden(next);
  };
  return (
    <figure className="sb-story-oikos">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={t("story-oikos-label", {
          name: props.name,
          defaultValue: "The oikos of {{name}}",
        })}
      >
        {rings.map((r, i) => (
          <circle
            key={r.key}
            cx={c}
            cy={c}
            r={radius(i)}
            className={`sb-story-oikos-ring sb-story-oikos-ring-${r.key}`}
          />
        ))}
        <circle cx={c} cy={c} r={30} className="sb-story-oikos-centre" />
        <text
          x={c}
          y={c + 4}
          textAnchor="middle"
          className="sb-story-oikos-centre-label"
        >
          {props.name.length > 12 ? `${props.name.slice(0, 11)}…` : props.name}
        </text>
        {rings.map((r, i) =>
          r.shown.map((m, j) => {
            // Each ring starts a little turned from the one inside it, so names do not line up and collide.
            const a =
              (2 * Math.PI * j) / r.shown.length - Math.PI / 2 + i * 0.35;
            const x = c + radius(i) * Math.cos(a);
            const y = c + radius(i) * Math.sin(a);
            const label = nameOf(m.label);
            const name = label.length > 13 ? `${label.slice(0, 12)}…` : label;
            const open = m.path ? () => props.onOpen(m.path!) : undefined;
            return (
              <g
                key={`${r.key}-${m.id}`}
                className={`sb-story-oikos-node sb-story-oikos-${m.kind} sb-story-oikos-in-${r.key}${open ? " sb-story-oikos-link" : ""}`}
                role={open ? "button" : undefined}
                {...svgFocusable(!!open)}
                aria-label={`${label}, ${m.relations.join(", ")}`}
                onClick={open}
                onKeyDown={(e) => {
                  const k = (e as KeyboardEvent).key;
                  if (open && (k === "Enter" || k === " ")) {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                <title>{`${label} — ${m.relations.join(", ")}`}</title>
                {m.kind === "community" || m.kind === "group" ? (
                  <rect x={x - 7} y={y - 7} width={14} height={14} rx={3} />
                ) : (
                  <circle cx={x} cy={y} r={7} />
                )}
                {/* Neighbours alternate above and below their dot, so their names do not run into each other. */}
                <text x={x} y={j % 2 ? y - 11 : y + 18} textAnchor="middle">
                  {name}
                </text>
              </g>
            );
          })
        )}
      </svg>
      <figcaption className="sb-story-oikos-legend">
        {all.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`sb-story-oikos-key sb-story-oikos-key-${r.key}`}
            aria-pressed={!hidden.has(r.key)}
            onClick={() => toggle(r.key)}
          >
            {r.label}
            {r.more ? ` (+${r.more})` : ""}
          </button>
        ))}
      </figcaption>
      <TieList
        oikos={props.oikos}
        source={props.source}
        ties={props.ties}
        onOpen={props.onOpen}
        goTo={props.goTo}
      />
    </figure>
  );
}

/** Every tie by kind, each name opening its card, and where the family ties come from. */
export function TieList(props: {
  oikos: Oikos;
  source?: string | null;
  ties?: OikosTie[];
  onOpen: (path: string) => void;
  goTo: (osis: string) => void;
}) {
  const { t } = useI18n();
  /** The verses that attest a tie to `id`, as the oikos model states them. */
  const versesOf = (id: string) => [
    ...new Set(
      (props.ties ?? []).filter((x) => x.to.id === id).flatMap((x) => x.verses)
    ),
  ];
  const rows = TIES.map((tie) => ({
    tie,
    xs: props.oikos[tie.key] ?? [],
  })).filter((r) => r.xs.length);
  if (!rows.length) return null;
  return (
    <div className="sb-story-ties">
      {rows.map(({ tie, xs }) => (
        <p key={tie.key} className="sb-small">
          <span className="sb-rp-section-label">
            {t(`story-tie-${tie.key}`, { defaultValue: tie.label })}
          </span>{" "}
          {xs.map((x: EntityRef, i: number) => (
            <span key={x.id}>
              {i ? ", " : ""}
              {x.path ? (
                <button
                  type="button"
                  className="sb-note-button sb-story-name"
                  onClick={() => props.onOpen(x.path!)}
                >
                  {nameOf(x.label)}
                </button>
              ) : (
                nameOf(x.label)
              )}
              {versesOf(x.id).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="sb-note-button sb-story-ref sb-story-tie-verse"
                  onClick={() => props.goTo(v)}
                >
                  {v.replace(/\./, " ").replace(/\./, ":")}
                </button>
              ))}
            </span>
          ))}
        </p>
      ))}
      {props.source && (
        <p className="sb-small sb-muted">
          {t("story-kinship-source", {
            source: props.source,
            defaultValue:
              "Family ties: {{source}}; aunts, uncles, cousins and in-laws are worked out from them. A tie the text states is shown with its verse.",
          })}
        </p>
      )}
    </div>
  );
}
