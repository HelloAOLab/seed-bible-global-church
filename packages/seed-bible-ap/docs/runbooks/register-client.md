# Register the `seed-bible-reader` client at the Home — done 2026-10-21

The Home side is an operator change in ap-home (`apps/home/src/whitelabel/config.ts`); a push to `master` deploys the
Vercel project `faithnet-home`. Facts: `estate/client.seed-bible-reader.json`. `pnpm register:client` prints the entry
to paste (`scripts/register-client.mjs`).

- `redirect_uris`: `https://seed-reader.faithnet.io/`, `http://localhost:5185/`
- `allowed_scopes`: `openid profile agent`
- `allowed_delegation_templates`: `site-login`, `ask-as-me`
- `delegate`: the shared relying delegate `0x89D1…ffD0`
- `ask_delegate`: reader-a2a's asking key (`READER_ASK_PRIVATE_KEY` on the Worker; address in the facts file)
- `ask_with_login: true` — the plain sign-in mints the ask-as-me wire beside the id_token (`/token` returns `askDelegation`)
- `libraryFolders: ['seed-bible']`

Verify: `POST https://www.faithnet.me/connect/demo-signin { handle: "seedreader", client_id: "seed-bible-reader", delegation_template: "ask-as-me" }`
returns an `id_token` and a `delegation` whose `delegate` is the asking key.
