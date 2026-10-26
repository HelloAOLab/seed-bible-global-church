# Rotate `A2A_INTERNAL_MARKER`

The marker is the in-Worker secret the run Durable Object requires on every store call (spec 341 §7). It is not a custody
key; rotating it invalidates nothing a person holds.

```bash
node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))' | wrangler secret put A2A_INTERNAL_MARKER -c apps/reader-a2a/wrangler.toml --env faithnet
```

Locally, edit `A2A_INTERNAL_MARKER` in `apps/reader-a2a/.dev.vars` (or re-run `pnpm seed:reader`, which keeps the existing one).
