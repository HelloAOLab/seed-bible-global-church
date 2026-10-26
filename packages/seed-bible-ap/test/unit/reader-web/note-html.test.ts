// A note's HTML stays within TipTap's vocabulary when rendered; anything else a merge could bring is dropped.
import { describe, expect, it } from "vitest";
import {
  isHtmlNote,
  noteText,
  sanitizeNoteHtml,
} from "../../../apps/reader-web/src/components/records/noteHtml";

describe("note html", () => {
  it("keeps the editor's own markup, including verse links into the reader", () => {
    const html =
      '<p class="text-center">For <strong>God</strong> so <em>loved</em> — see <a class="sb-verse-reference-link" href="/read/BSB/JHN/3" data-verse="16">John 3:16</a></p><ul><li>one</li></ul>';
    expect(sanitizeNoteHtml(html)).toBe(html);
  });
  it("drops scripts, handlers, foreign links and unknown tags", () => {
    const html =
      '<p onclick="x()">hi <script>alert(1)</script><a href="https://evil.example" class="sb-verse-reference-link">x</a><img src=x onerror=y><span style="color:red">s</span></p>';
    expect(sanitizeNoteHtml(html)).toBe(
      '<p>hi <a class="sb-verse-reference-link">x</a><span>s</span></p>'
    );
  });
  it("tells html notes from the first cut's plain text, and flattens both to text", () => {
    expect(isHtmlNote("<p>x</p>")).toBe(true);
    expect(isHtmlNote("plain, with 3 < 4")).toBe(false);
    expect(noteText("<p>For <strong>God</strong></p><p>so loved</p>")).toBe(
      "For God so loved"
    );
  });
});
