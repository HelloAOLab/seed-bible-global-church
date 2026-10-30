// VIDEOS AND ARTICLES — what the publishing app holds about the chapter on screen, in Discover: BibleProject's overviews
// (the section of the video that covers this chapter, at the second it starts) and the curated videos the old reader
// offered, each published as a signed `media` work with the books, chapters and verses it is about. Asked through this
// reader's agent (state/published.ts); opening one opens it at its maker, in a new tab.
import type { DiscoverItem, ExtensionRegistration } from "../host";
import { loadPublished, type PublishedMedia } from "../../state/published";

/** A published medium as a Discover card: its maker and the passage it is about, and where it plays in place. */
export function discoverItemOf(m: PublishedMedia): DiscoverItem {
  return {
    id: `published:${m.item.id}`,
    title: m.item.title,
    description: `${m.item.provider} · ${m.references.map((r) => r.osis).join(", ")}`,
    icon: m.item.medium === "article" ? "article" : "play_circle",
    author: m.item.provider,
    ...(m.item.description ? { longText: m.item.description } : {}),
    ...(m.item.image ? { image: m.item.image } : {}),
    ...(m.item.embedUrl ? { embedUrl: m.item.embedUrl } : {}),
    onOpen: () => window.open(m.item.url, "_blank", "noopener,noreferrer"),
  };
}

const defaultContent: ExtensionRegistration = {
  id: "default-content",
  label: "Videos and articles",
  description:
    "Videos and articles published about the chapter on screen (BibleProject's overviews, curated videos), in Discover.",
  init: function* (ctx) {
    yield ctx.discover.registerProvider({
      id: "default-content",
      label: "Videos and articles",
      discover: async (d) =>
        (
          (await loadPublished(
            d.chapterRef,
            "section",
            ctx.state.stores.chapters
          )) ?? []
        ).map(discoverItemOf),
    });
  },
};

export default defaultContent;
