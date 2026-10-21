# Mint a demo person (`seedreader.me`) — done 2026-10-21

A person on the faithnet estate: a custodian EOA (the key), the Smart Agent it custodies (`{ mode 0, custodians [eoa], salt 0 }`),
the `person` type on its profile, a vault key bound at `mcp.faithnet.io`, a treasury the Home mints on first sign-in, and a
`.me` name bought from it.

```bash
cd packages/seed-bible-ap
pnpm seed:reader                                   # generate: key → .seed/reader.local.json; facts → estate/seed-reader.faithnet.json; dev vars
pnpm seed:reader -- --mint                         # on chain: deploy the account, declare `person`, bind the vault key
node scripts/home-roster.mjs .seed/reader.local.json seedreader --base <full roster>   # Quick Connect: see README "The Home's demo roster"
# first Home sign-in mints the treasury (1,000 SHQ): ap-home `node scripts/backfill-431-treasuries.cjs https://www.faithnet.me seed`
# the name (priced root, spec 431):
cd ~/ap-home && NEXT_PUBLIC_CHAIN_ID=34348 npx tsx scripts/buy-name.mts --persona seedreader --owner <sa> --label seedreader --tld me
```

Keys live only in `.seed/` and in the Home's `DEMO_PERSONA_KEYS`. `estate/` holds addresses.
