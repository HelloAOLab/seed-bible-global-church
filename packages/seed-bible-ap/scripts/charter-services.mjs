#!/usr/bin/env node
/**
 * THE CHARTER CEREMONIES, as commands. Every agent of this estate is chartered THROUGH THE PERSON'S OWN ASK at
 * www.faithnet.me by ap-home's scripts (docs/runbooks/charter-services.md); this prints each command with this
 * package's paths filled in and the facts it already knows, and runs nothing. Run them one at a time, in order;
 * each is idempotent on its own.
 *
 *   pnpm charter:services
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
const eoa =
  people.people.seedreader?.custodianEoa ?? "<seedreader custodian eoa>";
console.log(`# run from ~/ap-home with the estate's chain id in the environment
cd ~/ap-home && export NEXT_PUBLIC_CHAIN_ID=34348

# 1. seed-reader.org — the governing organization (${org.org?.sa ?? "not chartered yet"})
npx tsx scripts/create-organization-via-home.mts --home https://www.faithnet.me --by seedreader \\
  --roster ${R}/.seed/reader.local.json --deployment faithchain --label seed-reader --note ${R}/estate/seed-reader-org.faithnet.json

# 2. seed-reader.workspace — standalone, custodied by seedreader's key (${people.workspace?.sa ?? "not chartered yet"})
RPC_URL=https://a2a.faithnet.io/rpc RELAY_PRIVATE_KEY_FILE=~/.faithchain-deployer.key CUSTODIAN_KEY_ENV_FILE=<0600 file with CUSTODIAN_PRIVATE_KEY=…> \\
  npx tsx scripts/charter-service-agent.mts --type workspace --service-role workspace --salt 1 --display "Seed Bible reader workspace" --estate faithnet.estate
npx tsx scripts/bind-vault-key.mts seedreader ${people.workspace?.sa ?? "<ws>"}

# 3. seed-bible.svc — the serving plane (${svc.service?.sa ?? "not chartered yet"})
CUSTODIAN=${eoa} npx tsx scripts/charter-service.mts --persona seedreader --label seed-bible --note ${R}/estate/seed-bible-svc.faithnet.json

# then the names: pnpm buy:names`);
