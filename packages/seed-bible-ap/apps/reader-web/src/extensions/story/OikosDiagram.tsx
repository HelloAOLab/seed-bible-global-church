// THE OIKOS — a person at the centre of their web of relationships, in rings by closeness (the operations' oikos map,
// for a person of the Bible): the household nearest (parents, partner, children, siblings), then the people they walked
// with (companions, those they discipled, who discipled them), then the bodies they belonged to or planted (tribe,
// communities). Every ring holds at most twelve; more are counted. A name with a card opens it.
import { useI18n } from "../../i18n";
import type { EntityRef, Oikos } from "./data";

const RINGS: Array<{
  key: "household" | "walked-with" | "bodies";
  label: string;
  members: (o: Oikos) => Array<EntityRef & { relation: string }>;
}> = [
  {
    key: "household",
    label: "Household",
    members: (o) => [
      ...o.parents.map((x) => ({ ...x, relation: "parent" })),
      ...o.partners.map((x) => ({ ...x, relation: "partner" })),
      ...o.children.map((x) => ({ ...x, relation: "child" })),
      ...o.siblings.map((x) => ({ ...x, relation: "sibling" })),
    ],
  },
  {
    key: "walked-with",
    label: "Walked with",
    members: (o) => [
      ...o.discipledBy.map((x) => ({ ...x, relation: "discipled them" })),
      ...o.companions.map((x) => ({ ...x, relation: "companion" })),
      ...o.discipled.map((x) => ({ ...x, relation: "discipled" })),
    ],
  },
  {
    key: "bodies",
    label: "Bodies",
    members: (o) => [
      ...o.tribe.map((x) => ({ ...x, relation: "tribe" })),
      ...o.planted.map((x) => ({ ...x, relation: "planted" })),
    ],
  },
];
const PER_RING = 12;

export function oikosRings(o: Oikos) {
  return RINGS.map((r) => {
    const seen = new Set<string>();
    const all = r.members(o).filter((m) => !seen.has(m.id) && seen.add(m.id));
    return {
      key: r.key,
      label: r.label,
      shown: all.slice(0, PER_RING),
      more: Math.max(0, all.length - PER_RING),
    };
  }).filter((r) => r.shown.length);
}

export function OikosDiagram(props: {
  name: string;
  oikos: Oikos;
  onOpen: (path: string) => void;
}) {
  const { t } = useI18n();
  const rings = oikosRings(props.oikos).map((r) => ({
    ...r,
    label: t(`story-oikos-${r.key}`, { defaultValue: r.label }),
  }));
  if (!rings.length)
    return (
      <p className="sb-muted sb-small">
        {t("story-oikos-none", {
          defaultValue: "No relationships are recorded.",
        })}
      </p>
    );
  const size = 340;
  const c = size / 2;
  const radius = (i: number) => 58 + i * 52;
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
            key={r.label}
            cx={c}
            cy={c}
            r={radius(i)}
            className={`sb-story-oikos-ring sb-story-oikos-ring-${i}`}
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
            const name =
              m.label.length > 14 ? `${m.label.slice(0, 13)}…` : m.label;
            const open = m.path ? () => props.onOpen(m.path!) : undefined;
            return (
              <g
                key={`${r.label}-${m.id}`}
                className={`sb-story-oikos-node sb-story-oikos-${m.kind}${open ? " sb-story-oikos-link" : ""}`}
                role={open ? "button" : undefined}
                tabIndex={open ? 0 : undefined}
                onClick={open}
                onKeyDown={(e) => {
                  if (
                    open &&
                    ((e as KeyboardEvent).key === "Enter" ||
                      (e as KeyboardEvent).key === " ")
                  ) {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                <title>{`${m.label} — ${m.relation}`}</title>
                {m.kind === "community" || m.kind === "group" ? (
                  <rect x={x - 7} y={y - 7} width={14} height={14} rx={3} />
                ) : (
                  <circle cx={x} cy={y} r={7} />
                )}
                <text x={x} y={y + 19} textAnchor="middle">
                  {name}
                </text>
              </g>
            );
          })
        )}
      </svg>
      <figcaption className="sb-story-oikos-legend">
        {rings.map((r, i) => (
          <span
            key={r.label}
            className={`sb-story-oikos-key sb-story-oikos-key-${i}`}
          >
            {r.label}
            {r.more ? ` (+${r.more})` : ""}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
