# Deploy to faithnet

Order: reader-mcp → reader-a2a (service-bound to the mcp) → [seed-bible-mcp → seed-bible-a2a, step 3] → reader-web
(built with `--mode faithnet`). `pnpm deploy:faithnet` runs it. Secrets, once per Worker:

```bash
wrangler secret put A2A_INTERNAL_MARKER   -c apps/reader-a2a/wrangler.toml --env faithnet
wrangler secret put READER_ASK_PRIVATE_KEY -c apps/reader-a2a/wrangler.toml --env faithnet   # from .seed/reader-a2a-ask.local.json
CI=1 wrangler d1 migrations apply seed-reader-a2a --remote -c apps/reader-a2a/wrangler.toml --env faithnet
```

Hosts: `seed-reader.faithnet.io` (web), `seed-reader-a2a.faithnet.io` (agent) — custom domains on the `faithnet.io` zone of
the Cloudflare account the town runs on (`5da2feaa…`). Check: `/health` on the agent reports `agentSa`, `askingKey`, `wireStore`.
