# Secrets — what each Worker holds, and how to set or rotate it

No key is in source. `.dev.vars` files are git-ignored; `.seed/svc-admin.local.json` likewise.

| Worker         | Secret                  | Purpose                                                                           | Set with                                                                                    |
| -------------- | ----------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| reader-a2a     | `A2A_INTERNAL_MARKER`   | marks calls to the service-bound reader-mcp as internal                           | `wrangler secret put A2A_INTERNAL_MARKER -c apps/reader-a2a/wrangler.toml --env faithnet`   |
| reader-a2a     | `PLATFORM_UPLOAD_TOKEN` | bearer the workspace presents to the svc for `/files` (uploads) and `/companion`  | `wrangler secret put PLATFORM_UPLOAD_TOKEN -c apps/reader-a2a/wrangler.toml --env faithnet` |
| seed-bible-a2a | `A2A_INTERNAL_MARKER`   | same, for seed-bible-mcp                                                          | `… -c apps/seed-bible-a2a/wrangler.toml --env faithnet`                                     |
| seed-bible-a2a | `UPLOAD_TOKEN`          | must equal reader-a2a's `PLATFORM_UPLOAD_TOKEN`; guards `/files` and `/companion` | `wrangler secret put UPLOAD_TOKEN -c apps/seed-bible-a2a/wrangler.toml --env faithnet`      |

Rotate the upload token by setting the new value on the svc first, then on reader-a2a (a few seconds of refused
uploads is the only effect; nothing is stored under the token). The Workers AI binding (`[ai]`) needs no secret.
Bindings (not secrets): `FILES` (R2 `seed-bible-files`), `AI`, D1 for the registry — all in the `wrangler.toml`s.
