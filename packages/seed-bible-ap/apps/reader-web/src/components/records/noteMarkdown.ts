// A note's TipTap HTML as Markdown — what a published slice carries on the public shelf (ADR-0007: a descriptor
// plus a markdown rendering). Covers the editor's vocabulary; anything else is flattened to its text.
export function noteHtmlToMarkdown(html: string): string {
  let s = html;
  const text = (inner: string) => inner.replace(/<[^>]+>/g, "");
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_m, t) => `# ${text(t)}\n\n`);
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, t) => `## ${text(t)}\n\n`);
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, t) => `### ${text(t)}\n\n`);
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**");
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "_$2_");
  s = s.replace(/<u>([\s\S]*?)<\/u>/gi, "$1");
  s = s.replace(/<s>([\s\S]*?)<\/s>/gi, "~~$1~~");
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`");
  s = s.replace(
    /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, t) => `[${text(t)}](${href})`
  );
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, body: string) => {
    let i = 0;
    return (
      body.replace(
        /<li[^>]*>([\s\S]*?)<\/li>/gi,
        (_x, t) => `${++i}. ${text(t).trim()}\n`
      ) + "\n"
    );
  });
  s = s.replace(
    /<ul[^>]*>([\s\S]*?)<\/ul>/gi,
    (_m, body: string) =>
      body.replace(
        /<li[^>]*>([\s\S]*?)<\/li>/gi,
        (_x, t) => `- ${text(t).trim()}\n`
      ) + "\n"
  );
  s = s.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_m, t) => `> ${text(t).trim()}\n\n`
  );
  s = s.replace(/<br\s*\/?>/gi, "  \n");
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain text (the first cut's notes) as Markdown: paragraphs on blank lines. */
export const plainToMarkdown = (text: string) =>
  text.trim().replace(/\n{2,}/g, "\n\n");
