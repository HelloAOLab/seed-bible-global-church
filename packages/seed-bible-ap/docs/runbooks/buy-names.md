# Buy the priced names — done 2026-10-21

Names on faithchain are bought with Sheqel from the custodian's treasury against a ticket the Home's naming gate signs
(ap-town spec 431). The payer was seedreader's person-treasury `0x0a27f9dc…` (1,000 SHQ at birth).

| Name                    | Owner            | Price | Records written                                      |
| ----------------------- | ---------------- | ----- | ---------------------------------------------------- |
| `seedreader.me`         | `0xdbb41f…b3db`  | 8     | addr, agentKind                                      |
| `seed-reader.workspace` | `0x5dd5f3…307f`  | 4     | + displayName, description, a2aEndpoint              |
| `seed-reader.org`       | `0x0d6f3d…cea26` | 12    | + displayName, description                           |
| `seed-bible.svc`        | `0x8f627e…9333c` | 10    | + displayName, description, a2aEndpoint, mcpEndpoint |

```bash
cd ~/ap-home && export NEXT_PUBLIC_CHAIN_ID=34348
npx tsx scripts/buy-name.mts --persona seedreader --owner <sa> --label <label> --tld <tld> [--note <facets.json>] --preview   # price + ruling, signs nothing
npx tsx scripts/buy-name.mts --persona seedreader --owner <sa> --label <label> --tld <tld> [--note <facets.json>]             # buys and presents
```

`pnpm buy:names` prints the four commands (`scripts/buy-names.mjs`). A bought name never expires and is never resold.
Role-typed endings (`.workspace`, `.registry`) need the fix in ap-home `ebdafefa`.
