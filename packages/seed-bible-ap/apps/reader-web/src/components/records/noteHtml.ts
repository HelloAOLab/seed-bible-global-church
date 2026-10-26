// A NOTE'S HTML, made safe to render: TipTap writes a small, known vocabulary (paragraphs, headings, lists, bold /
// italic / underline / strike, verse-reference links, alignment classes); everything else is dropped, and a link
// may only point at the reader's own chapters. Notes are the reader's own, but a device merge brings text this page
// did not write, so the allowlist stands.
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "code",
  "pre",
  "a",
  "span",
]);
const ALLOWED_CLASSES = new Set([
  "text-left",
  "text-center",
  "text-right",
  "text-justify",
  "sb-verse-reference-link",
]);

/** Elements whose CONTENT is not text either: nothing between their tags is a note. */
const DROPPED_WITH_CONTENT = new Set([
  "script",
  "style",
  "template",
  "iframe",
  "object",
  "embed",
  "noscript",
]);

const escapeText = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sanitizeNoteHtml(html: string): string {
  let out = "";
  // A tag, a run of text, or a stray `<` that opens no tag (escaped, never dropped silently).
  const re = /<([^>]*)>|([^<]+)|(<)/g;
  let m: RegExpExecArray | null;
  let dropping: string | null = null;
  while ((m = re.exec(html))) {
    if (m[2] !== undefined || m[3] !== undefined) {
      if (!dropping) out += m[3] !== undefined ? "&lt;" : escapeText(m[2]!);
      continue;
    }
    const raw = m[1] ?? "";
    const closing = raw.startsWith("/");
    const nameMatch = /^\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(raw);
    const name = nameMatch?.[1]?.toLowerCase();
    if (dropping) {
      if (closing && name === dropping) dropping = null;
      continue;
    }
    if (name && DROPPED_WITH_CONTENT.has(name)) {
      if (!closing && !raw.trimEnd().endsWith("/")) dropping = name;
      continue;
    }
    if (!name || !ALLOWED_TAGS.has(name)) continue;
    if (closing) {
      if (name !== "br") out += `</${name}>`;
      continue;
    }
    const attrs: string[] = [];
    const classMatch = /\bclass\s*=\s*"([^"]*)"/i.exec(raw);
    if (classMatch) {
      const keep = classMatch[1]!
        .split(/\s+/)
        .filter((c) => ALLOWED_CLASSES.has(c));
      if (keep.length) attrs.push(`class="${keep.join(" ")}"`);
    }
    if (name === "a") {
      const href = /\bhref\s*=\s*"([^"]*)"/i.exec(raw)?.[1] ?? "";
      if (/^\/read\/[^"\s]*$/.test(href)) attrs.push(`href="${href}"`);
      const verse = /\bdata-verse\s*=\s*"([^"]*)"/i.exec(raw)?.[1];
      if (verse && /^\d+(-\d+)?$/.test(verse))
        attrs.push(`data-verse="${verse}"`);
    }
    out +=
      name === "br"
        ? "<br>"
        : `<${name}${attrs.length ? " " + attrs.join(" ") : ""}>`;
  }
  return out;
}

/** The note as plain text, for lists and previews. */
export function noteText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-3]|blockquote)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Is this note HTML (from the TipTap editor) rather than the plain text of the first cut? */
export const isHtmlNote = (note: string) =>
  /^\s*<([a-z][a-z0-9]*)\b[^>]*>/i.test(note);
