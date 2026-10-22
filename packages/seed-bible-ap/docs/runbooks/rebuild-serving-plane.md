# Rebuild the serving plane (`seed-bible.svc`)

Everything in `seed-bible.svc`'s D1 is derived from public shelves (ADR-0007). To prove it, or to recover:

```bash
cd packages/seed-bible-ap
# local
pnpm dev                          # svc on :8892 with a local D1
pnpm smoke:rebuild                # snapshot → wipe → reindex → compare
# faithnet (the admin token is the Worker secret ADMIN_TOKEN; a local copy sits in .seed/svc-admin.local.json)
SVC_BASE=https://seed-bible-a2a.faithnet.io ADMIN_TOKEN=… pnpm smoke:rebuild
```

By hand: `POST /admin/wipe` then `POST /admin/reindex`, both with `x-admin-token`. The cron re-crawls every
15 minutes anyway. Shelves are configuration: `PUT /admin/shelves { name, kind }` adds one (the public door is
derived from the name), `{ name, remove: true }` removes one; the first reindex on an empty table seeds
`seedreader.me` and `seed-reader.org`.

The full step-3 proof is `pnpm smoke:svc`: publish a slice as seedreader, see it indexed, rebuild with it present,
withdraw it, see it gone.
