#!/usr/bin/env node
/**
 * THE CLIENT REGISTRATION DELTA for the Home (docs/runbooks/register-client.md) — printed from the facts in
 * estate/client.seed-bible-reader.json as the whitelabel entry an operator pastes into ap-home
 * apps/home/src/whitelabel/config.ts. Nothing here talks to the Home.
 *
 *   pnpm register:client
 */
import { readFileSync } from "node:fs";
const c = JSON.parse(
  readFileSync(
    new URL("../estate/client.seed-bible-reader.json", import.meta.url),
    "utf8"
  )
);
const q = (s) => `'${s}'`;
console.log(`    {
      client_id: ${q(c.client_id)},
      name: ${q(c.name)},
      redirect_uris: [${c.redirect_uris.map(q).join(", ")}],
      allowed_scopes: [${c.allowed_scopes.map(q).join(", ")}],
      allowed_delegation_templates: [${c.allowed_delegation_templates.map(q).join(", ")}],
      delegate: ${q(c.delegate)},
      ask_delegate: (process.env.NEXT_PUBLIC_SEED_BIBLE_READER_ASK_DELEGATE || ${q(c.ask_delegate)}) as \`0x\${string}\`,
      ask_with_login: ${c.ask_with_login},
      libraryFolders: [${c.libraryFolders.map(q).join(", ")}],
    },`);
