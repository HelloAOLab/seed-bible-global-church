// THE CHAPTER'S MARKUP — ported from packages/seed-bible BibleReader.tsx (renderChapterContent and its helpers):
// the same `sb-*` elements the copied stylesheets dress, so the text, headings, poetry, red letters, footnote
// markers, verse numbers and highlight runs look as they do in the reader today. What was left out of this cut:
// live-session decorations and presence. The highlight runs carry `data-highlight-fill` for the ribbon layer in
// ChapterColumn.tsx, which draws each run as a rounded path behind the text.
import type { VerseCheck } from "@seed/scripture/verify";
import { Fragment, type JSX } from "preact";
import type { ChapterVerse, TranslationBookChapter } from "../../backend/bible";
import type { ChapterHighlight } from "../../state/records/highlights";
import type { Note } from "../../state/records/annotations";
import type { ScriptureElementsBehavior } from "../../state/chrome/settings";

type Part = ChapterVerse["content"][0];

interface VerseLine {
  indentLevel: number;
  parts: ChapterVerse["content"];
}
type VerseSegment =
  | { type: "inline"; parts: ChapterVerse["content"] }
  | { type: "poetry"; lines: VerseLine[] };

function getPoemIndentLevel(part: Part) {
  if (
    part &&
    typeof part === "object" &&
    "text" in part &&
    typeof part.text === "string" &&
    typeof part.poem === "number" &&
    part.poem > 0
  )
    return part.poem;
  return null;
}

const isLineBreakPart = (part: Part | undefined): boolean =>
  !!part &&
  typeof part === "object" &&
  "lineBreak" in part &&
  part.lineBreak === true;

const isFootnotePart = (part: Part | undefined) =>
  !!part &&
  typeof part === "object" &&
  "noteId" in part &&
  typeof part.noteId === "number";

// Move a footnote before an immediately preceding line break so the marker
// stays attached to the text it belongs to instead of starting on the next line.
function reorderFootnoteBeforeLineBreak(
  content: ChapterVerse["content"]
): ChapterVerse["content"] {
  let reordered: ChapterVerse["content"] | undefined;
  for (let i = 0; i < content.length - 1; i += 1) {
    const cur = content[i]!;
    const next = content[i + 1]!;
    if (isLineBreakPart(cur) && isFootnotePart(next)) {
      reordered ??= [...content];
      reordered[i] = next;
      reordered[i + 1] = cur;
      i += 1;
    }
  }
  return reordered ?? content;
}

/** Text that reads on a reader's own highlight colour: dark on a light colour, white on a dark one. */
export function contrastText(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(
    (k) => parseInt(hex.slice(k, k + 2), 16) / 255
  );
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const l = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  return l > 0.4 ? "#1f1f1f" : "#ffffff";
}
export function getInlineText(part: Part): string {
  if (typeof part === "string") return part;
  if (part && typeof part === "object" && "text" in part)
    return typeof part.text === "string" ? part.text : "";
  return "";
}

/** A verse's words: its parts joined with a space (a footnote or a line break between two words leaves none in the
 *  text itself — "only" | note | "Son"), runs of space collapsed, none before closing punctuation. */
export const getVersePlainText = (content: ChapterVerse["content"]) =>
  content
    .map(getInlineText)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/ ([,.;:!?’”)\]])/g, "$1")
    .trim();

function splitVerseIntoSegments(
  content: ChapterVerse["content"]
): VerseSegment[] {
  const segments: VerseSegment[] = [];
  let inlineParts: ChapterVerse["content"] = [];
  let poetryLines: VerseLine[] = [];
  let line: VerseLine = { indentLevel: 0, parts: [] };
  let inPoetry = false;

  const pushLine = () => {
    if (line.parts.length > 0) {
      poetryLines.push({
        indentLevel: line.indentLevel,
        parts: [...line.parts],
      });
      line = { indentLevel: line.indentLevel, parts: [] };
    }
  };
  const flushPoetry = () => {
    pushLine();
    if (poetryLines.length > 0) {
      segments.push({ type: "poetry", lines: poetryLines });
      poetryLines = [];
    }
    line = { indentLevel: 0, parts: [] };
    inPoetry = false;
  };
  const flushInline = () => {
    if (inlineParts.length > 0) {
      segments.push({ type: "inline", parts: inlineParts });
      inlineParts = [];
    }
  };

  for (const part of content) {
    const indent = getPoemIndentLevel(part);
    if (isFootnotePart(part)) {
      if (inPoetry) line.parts.push(part);
      else inlineParts.push(part);
      continue;
    }
    if (indent !== null) {
      if (!inPoetry) {
        flushInline();
        inPoetry = true;
      }
      if (line.parts.length > 0 && line.indentLevel !== indent) pushLine();
      line.indentLevel = indent;
      line.parts.push(part);
    } else if (isLineBreakPart(part)) {
      if (inPoetry) pushLine();
      else inlineParts.push(part);
    } else {
      if (inPoetry) flushPoetry();
      inlineParts.push(part);
    }
  }
  if (inPoetry) flushPoetry();
  else flushInline();
  return segments;
}

export function renderInlineContent(
  part: Part,
  index: number,
  onOpenFootnote: (noteId: number) => void,
  showHeadings: boolean,
  showFootnotes: boolean,
  showRedLettering: boolean,
  isBeforeFootnote = false
): JSX.Element | null {
  if (typeof part === "string") {
    return <span key={index}>{isBeforeFootnote ? part.trimEnd() : part}</span>;
  }
  if (!part || typeof part !== "object") return null;
  if ("text" in part && typeof part.text === "string") {
    const className =
      part.wordsOfJesus && showRedLettering ? "sb-words-of-jesus" : "";
    const text = isBeforeFootnote ? part.text.trimEnd() : part.text;
    return (
      <span key={index} className={className}>
        {(index > 0 ? " " : "") + text}
      </span>
    );
  }
  if ("heading" in part && typeof part.heading === "string") {
    if (!showHeadings) return null;
    return <strong key={index}>{part.heading}</strong>;
  }
  if (isLineBreakPart(part)) return <br key={index} />;
  if ("noteId" in part && typeof part.noteId === "number") {
    if (!showFootnotes) return <span key={index}> </span>;
    const noteId = part.noteId;
    return (
      <span key={index} className="sb-inline-footnote">
        {" "}
        <button
          className="sb-inline-footnote-button"
          aria-label={`Open footnote ${noteId}`}
          title={`Open footnote ${noteId}`}
          onClick={(event: MouseEvent) => {
            event.stopPropagation();
            onOpenFootnote(noteId);
          }}
        >
          <span className="material-symbols-outlined">info</span>
        </button>
      </span>
    );
  }
  return null;
}

export interface ChapterContentOptions {
  selectedVerses: number[];
  /** The verse the recording or the voice is on, marked `sb-verse-playing`. */
  playingVerse?: number | null;
  highlights: ChapterHighlight[];
  /** A live session's decorations for this chapter, drawn as outlined (broadcast) highlights over the reader's own. */
  decorations?: ChapterHighlight[];
  notes: Note[];
  scriptureElements: ScriptureElementsBehavior;
  onVerseClick: (verseNumber: number, event: MouseEvent) => void;
  onOpenFootnote: (noteId: number, verse: ChapterVerse | null) => void;
  onAnnotationVerseClick: (verseNumber: number, event: MouseEvent) => void;
  /** Each verse's check against the published text (state/reading/scriptureCheck.ts), by verse number. */
  verseChecks?: Record<string, VerseCheck>;
  /** What a verse's check says, for its title. */
  verseCheckTitle?: (status: VerseCheck) => string;
  /** Verses someone in the live session just tapped: their numbers flare in that person's colour. */
  flares?: Array<{ id: string; verse: number; color: string }>;
}

export function renderChapterContent(
  chapterData: TranslationBookChapter | null,
  opts: ChapterContentOptions
): (JSX.Element | null)[] | null {
  if (!chapterData) return null;
  const { scriptureElements, selectedVerses, highlights, notes } = opts;

  const decorationOf = (verseNumber: number): ChapterHighlight | null => {
    for (const h of opts.decorations ?? []) {
      if (
        typeof h.verse === "number"
          ? h.verse === verseNumber
          : verseNumber >= h.verse[0] && verseNumber <= h.verse[1]
      )
        return h;
    }
    return null;
  };
  const getVerseHighlight = (verseNumber: number): ChapterHighlight | null => {
    const d = decorationOf(verseNumber);
    if (d) return d;
    if (!scriptureElements.showHighlights) return null;
    for (const h of highlights) {
      if (typeof h.verse === "number") {
        if (h.verse === verseNumber) return h;
        continue;
      }
      const [start, end] = h.verse;
      if (verseNumber >= start && verseNumber <= end) return h;
    }
    return null;
  };

  // Only matches a note to the verse it STARTS at — a John 3:3-6 note marks verse 3 only.
  const hasNote = (verseNumber: number) =>
    notes.some((n) => n.start === verseNumber);

  const renderVerseNumberOrIcon = (verseNumber: number) => {
    const annotated = hasNote(verseNumber);
    const handle = (event: MouseEvent) =>
      opts.onAnnotationVerseClick(verseNumber, event);
    const check = opts.verseChecks?.[String(verseNumber)];
    // A verse that does not match is always marked, verse numbers shown or not; a checked one marks its number.
    const alarm = check === "text-differs" || check === "not-in-corpus";
    if (scriptureElements.showVerseNumbers) {
      const flare = opts.flares?.find((f) => f.verse === verseNumber);
      return (
        <sup
          // A new key per flare restarts the animation when the same verse is tapped again.
          key={flare?.id}
          className={[
            "sb-verse-number",
            annotated ? "sb-verse-number-annotated" : "",
            check ? `sb-verse-check-${check}` : "",
            flare ? "sb-verse-number-flare" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            flare ? { "--sb-selection-flare-color": flare.color } : undefined
          }
          data-flare={flare ? "true" : undefined}
          title={check ? opts.verseCheckTitle?.(check) : undefined}
          data-verse-check={check}
          onClick={annotated ? handle : undefined}
          role={annotated ? "button" : undefined}
          tabIndex={annotated ? 0 : undefined}
        >
          {verseNumber}
        </sup>
      );
    }
    if (alarm && !annotated)
      return (
        <sup
          className={`sb-verse-number sb-verse-check-${check}`}
          title={opts.verseCheckTitle?.(check)}
          data-verse-check={check}
        >
          <span className="material-symbols-outlined">gpp_maybe</span>
        </sup>
      );
    if (!annotated) return null;
    return (
      <sup
        className="sb-verse-number sb-verse-annotation-icon"
        onClick={handle}
        role="button"
        tabIndex={0}
      >
        <span className="material-symbols-outlined">sticky_note_2</span>
      </sup>
    );
  };

  const inline = (
    part: Part,
    i: number,
    verse: ChapterVerse | null,
    next: Part | undefined
  ) =>
    renderInlineContent(
      part,
      i,
      (noteId) => opts.onOpenFootnote(noteId, verse),
      scriptureElements.showHeadings,
      scriptureElements.showFootnotes,
      scriptureElements.showRedLettering,
      isFootnotePart(next)
    );

  const renderVerseNode = (value: ChapterVerse, entryIndex: number) => {
    const isSelected = selectedVerses.includes(value.number);
    const content = reorderFootnoteBeforeLineBreak(value.content);
    const segments = splitVerseIntoSegments(content);
    const hasPoetry = segments.some((s) => s.type === "poetry");
    const verseClassName = [
      "sb-verse",
      hasPoetry ? "sb-verse-poetry" : "",
      isSelected ? "sb-verse-selected" : "",
      opts.playingVerse === value.number ? "sb-verse-playing" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const onClick = (event: MouseEvent) => {
      // Poetry lines are `display: block`; a click in the blank margin past a short line must not select.
      if (hasPoetry) {
        const target = event.target as HTMLElement | null;
        if (!target?.closest(".sb-verse-decorator")) return;
      }
      opts.onVerseClick(value.number, event);
    };

    if (hasPoetry) {
      return (
        <span
          key={`verse-${entryIndex}`}
          className={verseClassName}
          data-verse-number={value.number}
          onClick={onClick}
          style={{ cursor: "pointer" }}
          role="button"
          tabIndex={0}
        >
          {segments.map((segment, segIndex) => {
            if (segment.type === "inline") {
              return (
                <span
                  key={`verse-${entryIndex}-seg-${segIndex}-inline`}
                  className="sb-verse-decorator"
                >
                  {segIndex === 0 && renderVerseNumberOrIcon(value.number)}
                  {segment.parts.map((part, i) =>
                    inline(
                      part,
                      segIndex * 10000 + i,
                      value,
                      segment.parts[i + 1]
                    )
                  )}
                </span>
              );
            }
            return segment.lines.map((line, lineIndex) => (
              <span
                key={`verse-${entryIndex}-seg-${segIndex}-line-${lineIndex}`}
                className="sb-verse-line"
                style={{
                  paddingInlineStart:
                    line.indentLevel > 0
                      ? `${line.indentLevel * 30}px`
                      : undefined,
                }}
              >
                <span className="sb-verse-decorator">
                  {segIndex === 0 &&
                    lineIndex === 0 &&
                    renderVerseNumberOrIcon(value.number)}
                  {line.parts.map((part, i) =>
                    inline(part, i, value, line.parts[i + 1])
                  )}
                </span>
              </span>
            ));
          })}
        </span>
      );
    }

    return (
      <span
        key={`verse-${entryIndex}`}
        className={verseClassName}
        data-verse-number={value.number}
        onClick={onClick}
        style={{ cursor: "pointer" }}
        role="button"
        tabIndex={0}
      >
        <span className="sb-verse-decorator">
          {renderVerseNumberOrIcon(value.number)}
          {content.map((part, i) => inline(part, i, value, content[i + 1]))}
        </span>
      </span>
    );
  };

  const isVerseEntry = (entry: unknown): entry is ChapterVerse =>
    !!entry &&
    typeof entry === "object" &&
    (entry as { type?: unknown }).type === "verse" &&
    typeof (entry as ChapterVerse).number === "number" &&
    Array.isArray((entry as ChapterVerse).content);

  const entries = chapterData.chapter.content;
  const nodes: (JSX.Element | null)[] = [];
  // With verse numbers hidden adjacent verses would collide, so a real space goes between the spans.
  const needsVerseSpacing = !scriptureElements.showVerseNumbers;
  let previousWasVerse = false;
  const verseSeparator = (key: string) => <Fragment key={key}> </Fragment>;

  for (let i = 0; i < entries.length; ) {
    const entry = entries[i];
    if (!entry || typeof entry !== "object") {
      nodes.push(null);
      i += 1;
      continue;
    }
    if (entry.type === "heading" && Array.isArray(entry.content)) {
      if (!scriptureElements.showHeadings) {
        nodes.push(null);
        i += 1;
        continue;
      }
      const heading = (entry.content as unknown[])
        .filter((x) => typeof x === "string")
        .join(" ");
      nodes.push(
        <h3 key={`heading-${i}`} className="sb-chapter-heading">
          {heading}
        </h3>
      );
      previousWasVerse = false;
      i += 1;
      continue;
    }
    if (entry.type === "line_break") {
      nodes.push(<div key={`break-${i}`} className="sb-line-break" />);
      previousWasVerse = false;
      i += 1;
      continue;
    }
    if (entry.type === "hebrew_subtitle" && Array.isArray(entry.content)) {
      const parts = entry.content as ChapterVerse["content"];
      nodes.push(
        <p key={`subtitle-${i}`} className="sb-subtitle">
          {parts.map((part, j) => inline(part, j, null, parts[j + 1]))}
        </p>
      );
      previousWasVerse = false;
      i += 1;
      continue;
    }
    if (isVerseEntry(entry)) {
      const highlight = getVerseHighlight(entry.number);
      if (needsVerseSpacing && previousWasVerse)
        nodes.push(verseSeparator(`space-${i}`));
      previousWasVerse = true;
      if (!highlight) {
        nodes.push(renderVerseNode(entry, i));
        i += 1;
        continue;
      }
      // Contiguous same-colour PROSE verses share one run so the fill reads as one ribbon; poetry stays one
      // verse per run.
      const isPoetry = splitVerseIntoSegments(entry.content).some(
        (s) => s.type === "poetry"
      );
      const runIndices = [i];
      let j = i + 1;
      if (!isPoetry) {
        while (j < entries.length) {
          const next = entries[j];
          if (!isVerseEntry(next)) break;
          const nextHighlight = getVerseHighlight(next.number);
          const nextIsPoetry = splitVerseIntoSegments(next.content).some(
            (s) => s.type === "poetry"
          );
          if (
            !nextHighlight ||
            nextHighlight.colorId !== highlight.colorId ||
            nextHighlight.customColor !== highlight.customColor ||
            nextIsPoetry
          )
            break;
          runIndices.push(j);
          j += 1;
        }
      }
      const firstVerse = entry.number;
      const lastVerse = (
        entries[runIndices[runIndices.length - 1]!] as ChapterVerse
      ).number;
      nodes.push(
        <span
          key={`highlight-run-${i}`}
          className={`sb-highlight sb-highlight-${highlight.colorId}${highlight.id.startsWith("session:") ? " sb-highlight-broadcast" : ""}`}
          data-highlight-broadcast={
            highlight.id.startsWith("session:") ? "true" : undefined
          }
          data-highlight-fill={
            highlight.customColor ??
            `var(--sb-highlight-${highlight.colorId}-color, transparent)`
          }
          data-highlight-custom={highlight.customColor}
          style={
            highlight.customColor
              ? { color: contrastText(highlight.customColor) }
              : undefined
          }
          data-highlight-key={`${firstVerse}-${lastVerse}`}
        >
          {runIndices.flatMap((idx, runIndex) => {
            const node = renderVerseNode(entries[idx] as ChapterVerse, idx);
            return needsVerseSpacing && runIndex > 0
              ? [verseSeparator(`space-${idx}`), node]
              : [node];
          })}
        </span>
      );
      i = j;
      continue;
    }
    nodes.push(null);
    i += 1;
  }
  return nodes;
}
