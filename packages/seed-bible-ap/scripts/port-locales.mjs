#!/usr/bin/env node
/**
 * COPY THE LOCALE FILES from the live reader (`packages/seed-bible/seed-bible/i18n/*.json`, a READ-ONLY source
 * under the scope rule) into this package (`apps/reader-web/src/i18n/`). This package owns its copies: the
 * repo-wide "only update en.json" convention applies to them, and the other 76 are the translators'.
 *
 * Re-run whenever the source locales change. Idempotent; reports what changed.
 *
 *   pnpm port:locales
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const SOURCE = join(here, "..", "..", "seed-bible", "seed-bible", "i18n");
const TARGET = join(here, "..", "apps", "reader-web", "src", "i18n");

if (!existsSync(SOURCE)) throw new Error(`locale source not found: ${SOURCE}`);
mkdirSync(TARGET, { recursive: true });
// en.json is this reader's own (its keys are exactly what its components name — test/unit/reader-web/i18n-keys.test.ts);
// the other locale files are copied as the translators left them, and a key they lack falls back to English.
const files = readdirSync(SOURCE)
  .filter((f) => /^[a-z]{2,3}\.json$/.test(f) && f !== "en.json")
  .sort();
let copied = 0,
  same = 0;
for (const f of files) {
  const src = join(SOURCE, f),
    dst = join(TARGET, f);
  if (
    existsSync(dst) &&
    readFileSync(src, "utf8") === readFileSync(dst, "utf8")
  ) {
    same++;
    continue;
  }
  copyFileSync(src, dst);
  copied++;
}
console.log(
  `${files.length} locale files · ${copied} copied · ${same} unchanged → ${TARGET}`
);
