// THE HEADING TOOLBAR — what the verse toolbar is to a choice of verses, for a section heading ("The First Day"): an
// edition's heading over a run of verses (scr:EditionMark of kind section-heading, over its scr:Pericope). Tapping a heading
// chooses its section; this row floats just above it (on a phone, along the bottom) with the tools extensions register
// for a section (the story layer's Scene, Cast, Setting …), then Select (the section's verses, for the verse tools) and
// Cancel. It dresses itself in the verse toolbar's `sb-verse-toolbar-*` elements so the two read as one family.
import { useLayoutEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { handleHorizontalListKeyNav } from "../keyboardNav";

export function HeadingToolbar({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const chosen = state.selection.heading.value;
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!chosen) return;
    const place = () => {
      const el = document.querySelector<HTMLElement>(
        `.sb-bible-reader-active [data-heading-start="${chosen.start}"]`
      );
      const r = el?.getBoundingClientRect();
      setAnchor(r ? { x: r.left + r.width / 2, y: r.top } : null);
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [chosen?.start, chosen?.heading]);
  if (!chosen) return null;
  const { reading } = state;
  const chapterRef = reading.chapterRef.value;
  const ctx = { chapterRef, ...chosen };
  const ref =
    chosen.start === chosen.end
      ? `${reading.bookName.value} ${reading.chapterNumber.value}:${chosen.start}`
      : `${reading.bookName.value} ${reading.chapterNumber.value}:${chosen.start}–${chosen.end}`;
  const tools = [...state.extensions.headingTools.value]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .filter((tool) => !tool.isVisible || tool.isVisible(ctx));
  const phone = typeof window !== "undefined" && window.innerWidth <= 720;
  const style =
    !phone && anchor
      ? {
          left: `${Math.min(Math.max(anchor.x, 200), window.innerWidth - 200)}px`,
          top: `${Math.min(Math.max(anchor.y - 12, 90), window.innerHeight - 100)}px`,
        }
      : undefined;
  const Action = (props: {
    icon: string;
    label: string;
    onClick: () => void;
    className?: string;
  }) => (
    <div className="sb-verse-toolbar-action-item">
      <button
        type="button"
        className={`sb-verse-toolbar-action${props.className ? ` ${props.className}` : ""}`}
        aria-label={props.label}
        title={props.label}
        onClick={props.onClick}
      >
        <span className="sb-verse-toolbar-action-icon">
          <span className="material-symbols-outlined">{props.icon}</span>
        </span>
        <span className="sb-verse-toolbar-action-label">{props.label}</span>
      </button>
    </div>
  );
  return (
    <div
      className={`sb-verse-toolbar sb-heading-toolbar ${!phone && anchor ? "sb-verse-toolbar-anchored" : "sb-verse-toolbar-docked"}`}
      role="toolbar"
      aria-label={t("heading-toolbar-label", {
        heading: chosen.heading,
        defaultValue: "Section: {{heading}}",
      })}
      style={style}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onKeyDown={(e) => {
        if ((e as KeyboardEvent).key === "Escape") {
          e.preventDefault();
          state.selection.clearHeading();
          return;
        }
        handleHorizontalListKeyNav(
          e as KeyboardEvent,
          e.currentTarget as HTMLElement
        );
      }}
    >
      <div className="sb-heading-toolbar-title">
        <span className="sb-heading-toolbar-heading">{chosen.heading}</span>
        <span className="sb-heading-toolbar-ref">{ref}</span>
      </div>
      <div className="sb-verse-toolbar-tools">
        {tools.map((tool) => (
          <Action
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            onClick={() => tool.onSelect(ctx)}
          />
        ))}
        <Action
          icon="select"
          label={t("heading-select-verses", { defaultValue: "Select" })}
          onClick={() => state.selection.select(chosen.start, chosen.end)}
        />
        <Action
          icon="close"
          label={t("cancel", { defaultValue: "Cancel" })}
          className="sb-verse-toolbar-cancel"
          onClick={() => state.selection.clearHeading()}
        />
      </div>
    </div>
  );
}
