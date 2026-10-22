// The ported chapter markup rendered to a string: the same `sb-*` elements the old reader's stylesheets dress,
// highlight runs around the right verses, and the scripture-element switches honoured.
import { describe, expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { renderChapterContent } from "../../../apps/reader-web/src/components/reader/chapterContent";
import type { TranslationBookChapter } from "../../../apps/reader-web/src/backend/bible";
import type { ChapterHighlight } from "../../../apps/reader-web/src/state/records/highlights";
import type { Note } from "../../../apps/reader-web/src/state/records/annotations";

const chapter = {
  translation: { id: "BSB" },
  book: { id: "JHN", name: "John" },
  chapter: {
    number: 3,
    content: [
      { type: "heading", content: ["Jesus and Nicodemus"] },
      { type: "verse", number: 1, content: ["Now there was a Pharisee"] },
      {
        type: "verse",
        number: 2,
        content: [{ text: "He came to Jesus" }, { noteId: 1 }],
      },
      {
        type: "verse",
        number: 3,
        content: [
          { text: "Truly, truly, I tell you,", wordsOfJesus: true },
          { text: "no one can see", poem: 1 },
        ],
      },
      { type: "line_break" },
      { type: "verse", number: 16, content: ["For God so loved the world"] },
      { type: "verse", number: 17, content: ["For God did not send"] },
      { type: "verse", number: 18, content: ["Whoever believes"] },
    ],
    footnotes: [{ noteId: 1, text: "Or by night", caller: "+" }],
  },
} as unknown as TranslationBookChapter;

const base = {
  selectedVerses: [] as number[],
  highlights: [] as ChapterHighlight[],
  notes: [] as Note[],
  scriptureElements: {
    showVerseNumbers: true,
    showHeadings: true,
    showFootnotes: true,
    showRedLettering: true,
    showHighlights: true,
  },
  onVerseClick: () => {},
  onOpenFootnote: () => {},
  onAnnotationVerseClick: () => {},
};

const html = (opts: Partial<typeof base> = {}) =>
  render(<>{renderChapterContent(chapter, { ...base, ...opts })}</>);

describe("chapter content", () => {
  it("renders the reader's elements", () => {
    const out = html();
    expect(out).toContain(
      '<h3 class="sb-chapter-heading">Jesus and Nicodemus</h3>'
    );
    expect(out).toContain('data-verse-number="1"');
    expect(out).toContain('<sup class="sb-verse-number">2</sup>');
    expect(out).toContain('class="sb-words-of-jesus"');
    expect(out).toContain("sb-verse-poetry");
    expect(out).toContain('class="sb-inline-footnote-button"');
    expect(out).toContain('<div class="sb-line-break"></div>');
  });

  it("wraps contiguous same-colour prose verses in one highlight run and leaves the rest alone", () => {
    const out = html({
      highlights: [
        { id: "a", colorId: "yellow", verse: [16, 17] },
        { id: "b", colorId: "green", verse: 1 },
      ],
    });
    expect(out).toContain(
      'class="sb-highlight sb-highlight-yellow" data-highlight-fill="var(--sb-highlight-yellow-color, transparent)" data-highlight-key="16-17"'
    );
    expect(out).toContain(
      'class="sb-highlight sb-highlight-green" data-highlight-fill="var(--sb-highlight-green-color, transparent)" data-highlight-key="1-1"'
    );
    const run = out.slice(out.indexOf('data-highlight-key="16-17"'));
    const runEnd = run.indexOf('data-verse-number="18"');
    expect(run.slice(0, runEnd)).toContain('data-verse-number="17"');
    expect(out).not.toContain('data-highlight-key="18-18"');
  });

  it("honours the scripture-element switches", () => {
    const out = html({
      scriptureElements: {
        showVerseNumbers: false,
        showHeadings: false,
        showFootnotes: false,
        showRedLettering: false,
        showHighlights: false,
      },
      highlights: [{ id: "a", colorId: "yellow", verse: 16 }],
    });
    expect(out).not.toContain("sb-chapter-heading");
    expect(out).not.toContain("sb-verse-number");
    expect(out).not.toContain("sb-inline-footnote-button");
    expect(out).not.toContain("sb-words-of-jesus");
    expect(out).not.toContain("sb-highlight");
    // With numbers hidden a real space keeps adjacent verses apart.
    expect(out).toContain("</span></span> <span");
  });

  it("marks the verse a note starts at, and the selected verses", () => {
    const out = html({
      notes: [{ id: "n", start: 16, end: 18, note: "x", updatedAt: "" }],
      selectedVerses: [2],
    });
    expect(out).toContain(
      '<sup class="sb-verse-number sb-verse-number-annotated" role="button" tabindex="0">16</sup>'
    );
    expect(out).toContain('<sup class="sb-verse-number">17</sup>');
    expect(out).toContain(
      'class="sb-verse sb-verse-selected" data-verse-number="2"'
    );
  });
});
