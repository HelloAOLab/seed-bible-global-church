# Charter the estate's agents — done 2026-10-21

All three are custodied by `seedreader`'s credential and stewarded by `seedreader.me`. Every ceremony runs as the person
through their Home (`demo-signin` → `/harness/ask` → mandate signed by `persona-sign`); nothing is minted by a script key.
The ap-home scripts need `NEXT_PUBLIC_CHAIN_ID=34348` in the environment.

| Agent                             | How                                                                                                                                                                                                        | Address            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `seed-reader.org` (governing org) | `create-organization-via-home.mts --home https://www.faithnet.me --by seedreader --roster .seed/reader.local.json --deployment faithchain --label seed-reader --note estate/seed-reader-org.faithnet.json` | `0x0D6f3D14…cEA26` |
| `seed-reader.workspace`           | chartered earlier with `charter-service-agent.mts --type workspace --salt 1` over seedreader's key (standalone); vault key bound with `bind-vault-key.mts seedreader <ws>`                                 | `0x5DD5f3dB…d307F` |
| `seed-bible.svc`                  | `CUSTODIAN=<seedreader eoa> charter-service.mts --persona seedreader --label seed-bible --note estate/seed-bible-svc.faithnet.json` (binds the vault key)                                                  | `0x8f627ecA…9333c` |

`pnpm charter:services` prints these commands with the right paths filled in (`scripts/charter-services.mjs`); it does not run them.

**Open — pairing the workspace with its org.** The Home's `workspace-create` ceremony writes the `workspace.governor` /
`workspace:<ws>` pair at creation. Our workspace predates the org and has no stewardship wire from a genesis, so the pair
is not written; it stands alone (the hub doctrine allows this: no governor, no members). When the org gets members
(step 5), either re-charter the workspace under the org through the Home ceremony or mint a ws→steward stewardship wire
(approve-hash as the workspace, the `backfill-424` path) and write the pair.
