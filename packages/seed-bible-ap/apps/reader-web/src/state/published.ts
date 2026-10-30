// WHAT IS PUBLISHED ABOUT A BOOK, A PASSAGE OR A VERSE — the publishing app's videos, articles and recordings whose signed
// scripture references overlap the place asked (its `publisher.about`, through this reader's agent: `/api/about/<ref>`),
// narrowest first. A book's overviews are asked with scope `book`; a section, a chapter or a verse with scope `section`.
// Answers are kept on the device for a few hours, so a pane opened twice asks once.
import { A2A_BASE } from "../api";

type Cache = {
  get: (k: string) => Promise<unknown>;
  set: (k: string, v: unknown) => Promise<void>;
};
/** A video, article or recording the publishing app holds, as the publisher contract carries it (`publisher.about`). */
export interface PublishedMedia {
  item: {
    kind: "media";
    medium: string;
    id: string;
    title: string;
    provider: string;
    url: string;
    embedUrl?: string;
    image?: string;
    description?: string;
    startSeconds?: number;
  };
  /** The spans it is about: `Gen`, `Gen.1-11`, `Matt.26.20-30`. */
  references: Array<{ osis: string; scope: string; relation: string }>;
  publisher: { handle: string };
  release: {
    work: string;
    title: string;
    url: string;
    signatureStatus: string;
  };
  license: string;
  attribution: string;
}

/** How long an answer kept on the device is used before it is asked again (what is published changes). */
const ABOUT_KEEP_MS = 6 * 60 * 60_000;

/** What the publishing app holds about a book (`GEN`, scope book), a passage (`GEN.1.3-5`, scope section) or a verse,
 *  through this reader's agent; empty when nothing is, null when it could not be asked. */
export async function loadPublished(
  ref: string,
  scope: "book" | "section",
  cache: Cache,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<PublishedMedia[] | null> {
  const key = `about1:${scope}:${ref}`;
  const hit = (await cache.get(key)) as
    | { at: number; items: PublishedMedia[] }
    | undefined;
  if (hit && now() - hit.at < ABOUT_KEEP_MS) return hit.items;
  const res = await fetchImpl(
    `${A2A_BASE}/api/about/${encodeURIComponent(ref)}?scope=${scope}`
  ).catch(() => null);
  const out = (await res?.json().catch(() => null)) as {
    ok?: boolean;
    items?: PublishedMedia[];
  } | null;
  if (!res?.ok || !out?.ok) return hit?.items ?? null;
  const items = (out.items ?? []).filter((i) => i?.item?.kind === "media");
  await cache.set(key, { at: now(), items });
  return items;
}
