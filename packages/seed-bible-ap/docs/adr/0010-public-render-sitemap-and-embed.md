# ADR-0010: The edge render is public-only: Open Graph, sitemap, robots and embed from public inputs

**Status:** accepted (2026-10-22) — first cut of the cutover step; settles hard-problems §14 (first form).

## Context

The old app's `server/` rendered chapter pages for crawlers and link previews, served a sitemap, and took
`?embed=`, `?theme=` and `?customization=` on the URL so a church site could frame the reader. On the estate the
Worker in front of the assets has tight CPU time and no reader state: everything private hydrates on the device
from IndexedDB, and nothing private may be needed to answer a crawler.

## Decision

1. **One public render, several outputs.** `renderChapterPage` (the chapter text, title, description, API seed)
   feeds the HTML, the Open Graph tags and the canonical link. The Worker adds the absolute URL; nothing reader-
   specific enters the page.
2. **Sitemap and robots from the Bible API's book list.** `/sitemap.xml` lists every chapter of the sitemap
   translations (BSB for now), built from `books.json` and cached a day in the Worker's Cache API; `/robots.txt`
   names it. A Bible API outage yields a sitemap of the home page alone, never a 5xx.
3. **Embed mode is a client decision.** `?embed=minimal|true` flips `ui.embed` (the reader alone, no chrome);
   `?theme=light|dark` sets the theme; `?customization=<descriptor id>` selects a published customization through
   the same `customizations.select` the account pane uses — so an embed carries no state of its own and a
   customization in an iframe is the registry's public document, read as any visitor reads it.
4. **The About pane carries the legal texts** as per-language bundles under `i18n/policies`, falling back to
   English. Acceptance is never persisted (as before).

## Consequences

- A shared chapter link previews correctly everywhere; crawlers index every BSB chapter; a church can frame the
  reader with its theme by URL.
- Shared-slice pages (a published note by URL) are still client-rendered — the next cut adds a public render of a
  slice through `library.public.read` on the svc.
- The first-visit card is a device preference (`onboarding:done`); an embed never shows it.
