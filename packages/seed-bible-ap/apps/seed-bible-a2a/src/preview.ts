// LINK PREVIEWS — what the old `OsManager.getLinkPreview` fetched through CasualOS: a page's Open Graph / Twitter
// card / title and description, read by the serving plane (never by the browser) with a size cap and a timeout,
// and cached at the edge. Pure parsing here; the fetch is in index.ts.
export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const META_RE = /<meta\s+[^>]*>/gi;
const ATTR_RE = /([a-zA-Z-:]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(ATTR_RE))
    out[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();

/** The preview a page's head describes; absolute image URL against `url`. */
export function parsePreview(html: string, url: string): LinkPreview {
  const head = html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(META_RE)) {
    const a = attrs(m[0]);
    const key = (a["property"] ?? a["name"] ?? "").toLowerCase();
    if (key && a["content"] !== undefined && !(key in meta))
      meta[key] = decode(a["content"]);
  }
  const title =
    meta["og:title"] ??
    meta["twitter:title"] ??
    decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  const description =
    meta["og:description"] ??
    meta["twitter:description"] ??
    meta["description"];
  let image =
    meta["og:image"] ??
    meta["og:image:url"] ??
    meta["twitter:image"] ??
    meta["twitter:image:src"];
  if (image) {
    try {
      image = new URL(image, url).toString();
    } catch {
      image = undefined;
    }
  }
  const siteName = meta["og:site_name"];
  return {
    url,
    ...(title ? { title: title.slice(0, 300) } : {}),
    ...(description ? { description: description.slice(0, 600) } : {}),
    ...(image && /^https?:\/\//.test(image) ? { image } : {}),
    ...(siteName ? { siteName: siteName.slice(0, 120) } : {}),
  };
}

export const MAX_PREVIEW_BYTES = 512 * 1024;
export const PREVIEW_TIMEOUT_MS = 8_000;

/** Fetch a page's head with a cap and a timeout, and parse it. Only http(s) URLs; a failure is a bare preview. */
export async function fetchPreview(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<LinkPreview> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { url };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { url };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const res = await fetchImpl(u.toString(), {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "Mozilla/5.0 (compatible; SeedBiblePreview/1.0; +https://seed-reader.faithnet.io)",
      },
      redirect: "follow",
      signal: ctl.signal,
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/text\/html|xhtml/.test(type))
      return { url: res.url || url };
    const reader = res.body?.getReader();
    if (!reader) return { url: res.url || url };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_PREVIEW_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    void reader.cancel().catch(() => {});
    const merged = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      merged.set(c.subarray(0, Math.min(c.byteLength, total - at)), at);
      at += c.byteLength;
      if (at >= total) break;
    }
    return parsePreview(new TextDecoder().decode(merged), res.url || url);
  } catch {
    return { url };
  } finally {
    clearTimeout(timer);
  }
}
