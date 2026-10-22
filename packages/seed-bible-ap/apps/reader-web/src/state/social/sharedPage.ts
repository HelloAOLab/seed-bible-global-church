// SHARED PAGES — the old reader's standalone page for a shared playlist, plan, note or theme: `/shared/<shelf>/<kind>/<slug>`
// names a released slice on someone's public shelf (the two files `seed.publish.slice` wrote). The edge renders its
// title, preview and text (worker/index.ts) so a pasted link shows what it is; the app opens it as a page with the
// actions that fit its kind. Read through the workspace's public lane, never by reaching the estate directly.
import type { Offering } from "./discover";

export const SHARED_KINDS = [
  "note",
  "playlist",
  "plan",
  "customization",
] as const;
export type SharedKind = (typeof SHARED_KINDS)[number];

export interface SharedRef {
  shelf: string;
  kind: SharedKind;
  slug: string;
}

const PUBLIC_FOLDER = "seed-bible/public";
const SHELF = /^[a-z0-9][a-z0-9.-]{1,80}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/i;

export function parseSharedPath(pathname: string): SharedRef | null {
  const m = /^\/shared\/([^/]+)\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  const [shelf, kind, slug] = [m[1]!, m[2]!, m[3]!].map(decodeURIComponent) as [
    string,
    string,
    string,
  ];
  if (!SHELF.test(shelf) || !SLUG.test(slug)) return null;
  if (!(SHARED_KINDS as readonly string[]).includes(kind)) return null;
  return { shelf, kind: kind as SharedKind, slug };
}

export const sharedPathOf = (r: SharedRef) =>
  `/shared/${encodeURIComponent(r.shelf)}/${r.kind}/${encodeURIComponent(r.slug)}`;

/** The shared page of a Discover offering, or null for a kind that has none (a profile) or no rendering. */
export function sharedRefOf(o: Offering): SharedRef | null {
  if (!(SHARED_KINDS as readonly string[]).includes(o.kind)) return null;
  const slug = o.markdownPath?.split("/").pop()?.replace(/\.md$/, "");
  return slug && SLUG.test(slug)
    ? { shelf: o.shelf, kind: o.kind as SharedKind, slug }
    : null;
}

export const sharedFilesOf = (r: SharedRef) => ({
  descriptor: `${PUBLIC_FOLDER}/${r.kind}/${r.slug}.jsonld`,
  markdown: `${PUBLIC_FOLDER}/${r.kind}/${r.slug}.md`,
});

export interface SharedPage extends SharedRef {
  title: string;
  /** The OSIS passage it is offered for (JHN.3.16), when it has one. */
  passage: string | null;
  markdown: string;
  /** The published work (playlist, plan, theme) inside the descriptor, unparsed; null for a note. */
  work: Record<string, unknown> | null;
  descriptorId: string | null;
}

/** Reads both files of a shared slice; null when neither is public (withdrawn, or never published). */
export async function loadSharedPage(
  readPublic: (shelf: string, path: string) => Promise<string>,
  ref: SharedRef
): Promise<SharedPage | null> {
  const files = sharedFilesOf(ref);
  const [json, markdown] = await Promise.all([
    readPublic(ref.shelf, files.descriptor).catch(() => null),
    readPublic(ref.shelf, files.markdown).catch(() => null),
  ]);
  if (json === null && markdown === null) return null;
  let d: Record<string, unknown> = {};
  try {
    const v: unknown = json ? JSON.parse(json) : {};
    if (v && typeof v === "object") d = v as Record<string, unknown>;
  } catch {
    /* a descriptor that is not JSON: the markdown alone is the page */
  }
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const work = d["work"];
  return {
    ...ref,
    title:
      str(d["label"]) ??
      /^#\s+(.+)$/m.exec(markdown ?? "")?.[1]?.trim() ??
      ref.slug,
    passage: str(d["offeredForPassage"]),
    markdown: markdown ?? "",
    work:
      work && typeof work === "object"
        ? (work as Record<string, unknown>)
        : null,
    descriptorId: str(d["@id"]),
  };
}

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

/**
 * The markdown a slice carries, as plain blocks — headings, bullet lists, paragraphs — so the edge and the app
 * draw it as text (escaped), never as markup someone else wrote. Links keep their label: `[label](url)` → label.
 */
export function markdownBlocks(md: string): MarkdownBlock[] {
  const out: MarkdownBlock[] = [];
  const inline = (s: string) =>
    s
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__|\*|_|`)/g, "")
      .trim();
  let para: string[] = [];
  const flush = () => {
    if (para.length)
      out.push({ type: "paragraph", text: inline(para.join(" ")) });
    para = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({
        type: "heading",
        level: h[1]!.length as 1 | 2 | 3,
        text: inline(h[2]!),
      });
    } else if (li) {
      flush();
      const last = out[out.length - 1];
      if (last?.type === "list") last.items.push(inline(li[1]!));
      else out.push({ type: "list", items: [inline(li[1]!)] });
    } else if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return out;
}

/** The text a link preview shows: the first paragraph or list, trimmed. */
export function sharedSummary(page: SharedPage): string {
  const blocks = markdownBlocks(page.markdown).filter(
    (b) => b.type !== "heading"
  );
  const first = blocks[0];
  const text = !first
    ? ""
    : first.type === "list"
      ? first.items.slice(0, 4).join(" · ")
      : first.text;
  return text.length > 200 ? `${text.slice(0, 197)}…` : text;
}
