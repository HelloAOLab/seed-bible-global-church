// GENERATIONS — what grew out of a person or a community, as the operations' generation map draws a stream of circles
// and churches: a person plants communities (scr:plantedBody) and disciples people (scr:discipled) who plant in turn; a
// community gives rise to others (scr:gaveRiseTo). Drawn left to right, one generation a column, one leaf a row; a
// community is a church ring, a person a dot. A node with a card opens it.
import { svgFocusable } from "./svgFocus";
import { useI18n } from "../../i18n";
import type { GenerationNode } from "./data";

const VIA: Record<string, string> = {
  plantedBody: "planted",
  discipled: "discipled",
  gaveRiseTo: "gave rise to",
  gatheredFrom: "gathered from",
};
const COL = 132;
const ROW = 34;

interface Placed {
  node: GenerationNode;
  x: number;
  y: number;
  depth: number;
  parent: Placed | null;
}

/** One row per leaf; a parent sits level with the middle of its children. */
export function layoutGenerations(root: GenerationNode): Placed[] {
  const out: Placed[] = [];
  let row = 0;
  const place = (
    n: GenerationNode,
    depth: number,
    parent: Placed | null
  ): Placed => {
    const p: Placed = { node: n, x: 16 + depth * COL, y: 0, depth, parent };
    out.push(p);
    if (!n.children.length) p.y = 20 + row++ * ROW;
    else {
      const kids = n.children.map((k) => place(k, depth + 1, p));
      p.y = (kids[0]!.y + kids[kids.length - 1]!.y) / 2;
    }
    return p;
  };
  place(root, 0, null);
  return out;
}

export function GenerationsDiagram(props: {
  root: GenerationNode;
  onOpen: (path: string) => void;
}) {
  const { t } = useI18n();
  if (!props.root.children.length)
    return (
      <p className="sb-muted sb-small">
        {t("story-generations-none", {
          name: props.root.label,
          defaultValue: "Nothing is recorded as growing out of {{name}}.",
        })}
      </p>
    );
  const placed = layoutGenerations(props.root);
  const width = Math.max(...placed.map((p) => p.x)) + COL;
  const height = Math.max(...placed.map((p) => p.y)) + 24;
  const generations = Math.max(...placed.map((p) => p.depth));
  return (
    <figure className="sb-story-generations">
      <div className="sb-story-generations-scroll">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t("story-generations-label", {
            name: props.root.label,
            count: generations,
            defaultValue: "What grew out of {{name}}: {{count}} generations",
          })}
        >
          {placed
            .filter((p) => p.parent)
            .map((p) => {
              const q = p.parent!;
              const mid = (q.x + p.x) / 2;
              return (
                <g
                  key={`e-${p.node.id}-${q.node.id}`}
                  className={`sb-story-gen-edge sb-story-gen-${p.node.via ?? ""}`}
                >
                  <path
                    d={`M${q.x + 9},${q.y} C${mid},${q.y} ${mid},${p.y} ${p.x - 9},${p.y}`}
                  />
                  <title>{`${q.node.label} ${VIA[p.node.via ?? ""] ?? ""} ${p.node.label}`}</title>
                </g>
              );
            })}
          {placed.map((p) => {
            const open =
              p.node.path && p.parent
                ? () => props.onOpen(p.node.path!)
                : undefined;
            const church = p.node.kind === "community";
            return (
              <g
                key={`n-${p.node.id}-${p.depth}`}
                className={`sb-story-gen-node${church ? " sb-story-gen-church" : ""}${open ? " sb-story-gen-link" : ""}`}
                role={open ? "button" : undefined}
                {...svgFocusable(!!open)}
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
                {church ? (
                  <circle cx={p.x} cy={p.y} r={9} />
                ) : (
                  <circle cx={p.x} cy={p.y} r={5} />
                )}
                {/* The root's lines fan out to its right, so its name sits above it. */}
                <text
                  x={p.parent ? p.x + 14 : p.x - 4}
                  y={p.parent ? p.y + 4 : p.y - 12}
                >
                  {p.node.label.length > 16
                    ? `${p.node.label.slice(0, 15)}…`
                    : p.node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="sb-small sb-muted">
        {t("story-generations-legend", {
          count: generations,
          defaultValue:
            "{{count}} generations · a ring is a church, a dot a person",
        })}{" "}
        ·{" "}
        <span className="sb-story-gen-key sb-story-gen-plantedBody">
          {t("story-via-planted", { defaultValue: "planted" })}
        </span>{" "}
        <span className="sb-story-gen-key sb-story-gen-discipled">
          {t("story-via-discipled", { defaultValue: "discipled" })}
        </span>{" "}
        <span className="sb-story-gen-key sb-story-gen-gaveRiseTo">
          {t("story-via-gave-rise-to", { defaultValue: "gave rise to" })}
        </span>
      </figcaption>
    </figure>
  );
}
