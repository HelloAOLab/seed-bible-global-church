// THE SANITIZATION MATRIX (test-plan A3.9, extending note-html.test.ts): a note's HTML keeps the editor's own
// tags, and nothing else survives — no script (nor its text), no handler, no javascript: link, no foreign link,
// no style, no unknown element — and empty or malformed input never throws.
import { describe, expect, it } from "vitest";
import {
  noteText,
  sanitizeNoteHtml,
} from "../../../apps/reader-web/src/components/records/noteHtml";

describe("sanitizeNoteHtml", () => {
  it("keeps every allowed tag with its allowed attributes", () => {
    const html =
      '<h1>Title</h1><h2>Sub</h2><h3>Minor</h3><p class="text-right">a <b>b</b> <i>i</i> <u>u</u> <s>s</s> <code>c</code></p><pre>pre</pre><blockquote>q</blockquote><ol><li>1</li></ol><p>x<br>y</p><span class="text-justify">j</span>';
    expect(sanitizeNoteHtml(html)).toBe(html);
  });

  it("drops a script with everything inside it, in any case and nesting", () => {
    expect(
      sanitizeNoteHtml("<p>hi</p><script>alert(1)</script><p>there</p>")
    ).toBe("<p>hi</p><p>there</p>");
    expect(
      sanitizeNoteHtml(
        "<p>hi <SCRIPT type=\"module\">fetch('x')</SCRIPT>there</p>"
      )
    ).toBe("<p>hi there</p>");
    expect(
      sanitizeNoteHtml(
        '<p>a<style>p{display:none}</style>b<iframe src="https://evil.example">c</iframe>d</p>'
      )
    ).toBe("<p>abd</p>");
    expect(
      sanitizeNoteHtml("<svg><script>alert(1)</script></svg><p>ok</p>")
    ).toBe("<p>ok</p>");
    expect(sanitizeNoteHtml("<p>open<script>never closed")).toBe("<p>open");
  });

  it("removes event handlers and other attributes however they are written", () => {
    expect(
      sanitizeNoteHtml(
        '<p onclick="x()" ONMOUSEOVER=\'y()\' style="color:red" id="z">t</p>'
      )
    ).toBe("<p>t</p>");
    expect(
      sanitizeNoteHtml(
        '<a href="/read/BSB/JHN/3" onclick="steal()" data-verse="16" target="_blank">v</a>'
      )
    ).toBe('<a href="/read/BSB/JHN/3" data-verse="16">v</a>');
    expect(sanitizeNoteHtml('<img src="x" onerror="alert(1)">')).toBe("");
  });

  it("neutralises javascript: and every other link that is not the reader's own chapter", () => {
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,alert(1)",
      "https://evil.example/read/BSB/JHN/3",
      "//evil.example/read/BSB/JHN/3",
    ])
      expect(sanitizeNoteHtml(`<a href="${href}">link</a>`), href).toBe(
        "<a>link</a>"
      );
    // A quote that tries to smuggle a handler ends the href; the handler goes with everything else.
    expect(
      sanitizeNoteHtml('<a href="/read/BSB/JHN/3" onclick="x">link</a>')
    ).toBe('<a href="/read/BSB/JHN/3">link</a>');
    expect(sanitizeNoteHtml('<a href="/read/BSB/JHN/3?v=16">link</a>')).toBe(
      '<a href="/read/BSB/JHN/3?v=16">link</a>'
    );
    expect(sanitizeNoteHtml('<a data-verse="16-18">r</a>')).toBe(
      '<a data-verse="16-18">r</a>'
    );
    expect(sanitizeNoteHtml('<a data-verse="16;alert(1)">r</a>')).toBe(
      "<a>r</a>"
    );
  });

  it("keeps only the editor's own classes", () => {
    expect(
      sanitizeNoteHtml(
        '<p class="text-center evil sb-verse-reference-link">t</p>'
      )
    ).toBe('<p class="text-center sb-verse-reference-link">t</p>');
    expect(sanitizeNoteHtml('<p class="evil">t</p>')).toBe("<p>t</p>");
  });

  it("escapes text that looks like markup and survives malformed input", () => {
    // The editor writes `&lt;`; a stray `<` that opens no tag is escaped, and a `<…>` run that is no known tag goes.
    expect(sanitizeNoteHtml("3 &lt; 4 and 5 &gt; 2")).toBe(
      "3 &lt; 4 and 5 &gt; 2"
    );
    expect(sanitizeNoteHtml("a < b")).toBe("a &lt; b");
    expect(sanitizeNoteHtml("3 < 4 and 5 > 2")).toBe("3  2");
    expect(sanitizeNoteHtml("<p>unclosed")).toBe("<p>unclosed");
    expect(sanitizeNoteHtml("x > y")).toBe("x &gt; y");
    expect(sanitizeNoteHtml("<div><section><p>deep</p></section></div>")).toBe(
      "<p>deep</p>"
    );
    expect(sanitizeNoteHtml("<p>a</p><!-- comment --><p>b</p>")).toBe(
      "<p>a</p><p>b</p>"
    );
    expect(sanitizeNoteHtml("<br/><br />")).toBe("<br><br>");
  });

  it("gives empty for empty, and whitespace stays whitespace", () => {
    expect(sanitizeNoteHtml("")).toBe("");
    expect(sanitizeNoteHtml("   ")).toBe("   ");
    expect(sanitizeNoteHtml("<script></script>")).toBe("");
    expect(noteText("")).toBe("");
    expect(noteText("<script>alert(1)</script>")).toBe("alert(1)");
  });
});
