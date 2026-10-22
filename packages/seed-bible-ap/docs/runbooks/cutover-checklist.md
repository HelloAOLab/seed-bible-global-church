# Cutover checklist — seed-reader.faithnet.io takes the traffic

Run top to bottom; every line is a command or a look, nothing is a guess.

1. **Secrets in place** (`wrangler secret list -c <toml> --env faithnet`):
   - reader-a2a: `A2A_INTERNAL_MARKER`, `PLATFORM_UPLOAD_TOKEN`
   - seed-bible-a2a (svc): `A2A_INTERNAL_MARKER`, `UPLOAD_TOKEN` (equal to the reader-a2a one; `secrets.md`)
2. **Deploy in order**: `pnpm deploy:faithnet` (mcp → a2a → svc-mcp → svc-a2a → web). Watch for a Durable Object
   migration line on reader-a2a (`ReadingSession`, `HarnessRunDO`).
3. **Smokes, all green** (from `packages/seed-bible-ap`, `A2A_BASE=https://seed-reader-a2a.faithnet.io`):
   `pnpm smoke:reader-web`, `pnpm smoke:session`, `pnpm smoke:svc`, `pnpm smoke:vault`, `pnpm smoke:rebuild`.
4. **Edge render**: `curl -sI -H "accept: text/html" https://seed-reader.faithnet.io/read/BSB/JHN/3 | grep x-sb-ssr`
   → `chapter`; `curl -s https://seed-reader.faithnet.io/read/BSB/JHN/3 | grep -o 'og:title[^>]*'`;
   `curl -s https://seed-reader.faithnet.io/sitemap.xml | head -3`; `curl -s https://seed-reader.faithnet.io/robots.txt`.
5. **Companion and files**: signed in on the live page, ask the flame one question (streams, names
   `seed-bible.svc · …`); add a cover image to a playlist (lands at `https://seed-bible-a2a.faithnet.io/files/…`).
6. **Embed**: open `https://seed-reader.faithnet.io/read/BSB/JHN/3?embed=minimal&theme=dark` — no sidebar, dark.
7. **Registry is honest**: `curl -s 'https://seed-bible-a2a.faithnet.io/registry/offerings?passage=JHN.3' | head -c 400`.
8. **DNS / redirects** (outside this repo): point `seedbible.org` chapter paths at `seed-reader.faithnet.io` only
   after 1–7 pass twice, an hour apart.
9. **Rollback**: `wrangler rollback -c apps/reader-web/wrangler.toml --env faithnet` restores the previous web
   build; the a2a/svc Workers roll back the same way. The vault is the record: no data step is needed.
