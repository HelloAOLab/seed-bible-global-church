// THE FAMILY — a person's relatives by generation, the way a family Bible's page sets them out: grandparents at the top,
// then the parents' generation (parents, aunts and uncles, parents-in-law), the person's own (spouses, brothers and
// sisters, their spouses, cousins), the children's (children, nieces and nephews, children's spouses) and grandchildren.
// The direct line is set apart from the rest of each generation; a relative holding two ties is shown once, in the
// nearer generation, and named with both. Each name opens its card.
import { useState } from "preact/hooks";
import { useI18n } from "../../i18n";
import type { EntityRef, Oikos } from "./data";
import { nameOf, TIES } from "./OikosDiagram";

type Key = keyof Oikos;
const GENERATIONS: Array<{
  id: string;
  label: string;
  line: Key[];
  others: Key[];
}> = [
  {
    id: "grandparents",
    label: "Grandparents",
    line: ["grandparents"],
    others: [],
  },
  {
    id: "parents",
    label: "Parents' generation",
    line: ["parents"],
    others: ["auntsUncles", "parentsInLaw"],
  },
  {
    id: "own",
    label: "Their generation",
    line: ["partners"],
    others: ["siblings", "siblingsInLaw", "cousins"],
  },
  {
    id: "children",
    label: "Children's generation",
    line: ["children"],
    others: ["niecesNephews", "childrenInLaw"],
  },
  {
    id: "grandchildren",
    label: "Grandchildren",
    line: ["grandchildren"],
    others: [],
  },
];
const SHOWN = 16;
const tieLabel = (k: Key) => TIES.find((t) => t.key === k)?.label ?? String(k);

interface Member extends EntityRef {
  ties: string[];
}

/** The generations, each relative once (in the first generation that holds them), the direct line first. */
export function familyGenerations(o: Oikos) {
  const seen = new Map<string, Member>();
  return GENERATIONS.map((g) => {
    const pick = (keys: Key[]) => {
      const out: Member[] = [];
      for (const k of keys)
        for (const x of o[k] ?? []) {
          const hit = seen.get(x.id);
          if (hit) {
            if (!hit.ties.includes(tieLabel(k))) hit.ties.push(tieLabel(k));
            continue;
          }
          const m = { ...x, ties: [tieLabel(k)] };
          seen.set(x.id, m);
          out.push(m);
        }
      return out;
    };
    return { ...g, line: pick(g.line), others: pick(g.others) };
  }).filter((g) => g.line.length || g.others.length || g.id === "own");
}

export function FamilyTree(props: {
  name: string;
  oikos: Oikos;
  onOpen: (path: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const gens = familyGenerations(props.oikos);
  if (gens.every((g) => !g.line.length && !g.others.length))
    return (
      <p className="sb-muted sb-small">
        {t("story-family-none", { defaultValue: "No family is recorded." })}
      </p>
    );
  const Chip = ({ m, line }: { m: Member; line: boolean }) => (
    <li
      className={`sb-story-family-member${line ? " sb-story-family-line" : ""}`}
      title={m.ties.join(", ")}
    >
      {m.path ? (
        <button
          type="button"
          className="sb-note-button"
          onClick={() => props.onOpen(m.path!)}
        >
          {nameOf(m.label)}
        </button>
      ) : (
        <span>{nameOf(m.label)}</span>
      )}
      <span className="sb-story-family-tie">{m.ties.join(", ")}</span>
    </li>
  );
  return (
    <div
      className="sb-story-family"
      role="list"
      aria-label={t("story-family-label", {
        name: props.name,
        defaultValue: "The family of {{name}}",
      })}
    >
      {gens.map((g) => {
        const more = g.others.length > SHOWN && !open.has(g.id);
        return (
          <section
            key={g.id}
            className={`sb-story-family-gen sb-story-family-${g.id}`}
            role="listitem"
          >
            <span className="sb-rp-section-label">
              {t(`story-family-${g.id}`, { defaultValue: g.label })}
            </span>
            <ul className="sb-story-family-row">
              {g.id === "own" && (
                <li className="sb-story-family-member sb-story-family-self">
                  <strong>{props.name}</strong>
                </li>
              )}
              {g.line.map((m) => (
                <Chip key={m.id} m={m} line />
              ))}
              {(more ? g.others.slice(0, SHOWN) : g.others).map((m) => (
                <Chip key={m.id} m={m} line={false} />
              ))}
              {more && (
                <li>
                  <button
                    type="button"
                    className="sb-note-button"
                    onClick={() => setOpen(new Set([...open, g.id]))}
                  >
                    {t("story-family-more", {
                      count: g.others.length - SHOWN,
                      defaultValue: "{{count}} more",
                    })}
                  </button>
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
