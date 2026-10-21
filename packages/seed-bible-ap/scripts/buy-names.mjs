#!/usr/bin/env node
/**
 * THE PRICED NAMES, as commands (docs/runbooks/buy-names.md). Bought from seedreader's treasury against the Home
 * gate's ticket by ap-home's buy-name.mts; this prints each command (preview first) and runs nothing.
 *
 *   pnpm buy:names
 */
import { readFileSync } from "node:fs";
const R = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const people = JSON.parse(
  readFileSync(`${R}/estate/seed-reader.faithnet.json`, "utf8")
);
const org = JSON.parse(
  readFileSync(`${R}/estate/seed-reader-org.faithnet.json`, "utf8")
);
const svc = JSON.parse(
  readFileSync(`${R}/estate/seed-bible-svc.faithnet.json`, "utf8")
);
const names = [
  ["seedreader", "me", people.people.seedreader?.sa, 8],
  ["seed-reader", "workspace", people.workspace?.sa, 4],
  ["seed-reader", "org", org.org?.sa, 12],
  ["seed-bible", "svc", svc.service?.sa, 10],
];
console.log("cd ~/ap-home && export NEXT_PUBLIC_CHAIN_ID=34348");
for (const [label, tld, owner, price] of names) {
  console.log(
    `\n# ${label}.${tld} (${price} SHQ) → ${owner ?? "<owner not chartered yet>"}`
  );
  console.log(
    `npx tsx scripts/buy-name.mts --persona seedreader --owner ${owner ?? "<owner>"} --label ${label} --tld ${tld} --preview`
  );
  console.log(
    `npx tsx scripts/buy-name.mts --persona seedreader --owner ${owner ?? "<owner>"} --label ${label} --tld ${tld} [--note <facets.json>]`
  );
}
