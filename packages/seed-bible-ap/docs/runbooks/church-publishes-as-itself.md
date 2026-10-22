# A church publishes as itself — what an organization needs before "Publish as" works

A steward signed into the reader picks the church under Account → **Publish as**; the workspace then addresses the
church's agent with the steward's own ask-as-me wire, and the runtime derives their standing on chain. For that to
land, the organization needs three things a scripted charter leaves undone (all from `ap-home`, as the steward's
demo persona, or by the steward clicking through their Home for a real person):

```bash
cd ~/ap-home
ENV='NEXT_PUBLIC_CHAIN_ID=34348 NEXT_PUBLIC_CONTRACTS_JSON="$(cat ~/agenticprimitives/packages/contracts/deployments-faithchain.json)"'
# 1. the steward link at the Home (the org's custodian signs a stewardship wire to the steward)
NOTE=<path to the org's estate note> BY=<steward handle> FORCE=1 npx tsx scripts/record-service-stewardship.mts
# 2. the org's vault key (without it every record read/write at the org fails closed: vault_key_unauthorized)
npx tsx scripts/bind-vault-key.mts <steward handle> <org address>
# 3. the org's playbook — org-steward carries the Library reads and saves the publish act uses
ARCHETYPE=org-steward npx tsx scripts/assign-org-archetype.mts <steward handle> <org address>
```

Then register the church's shelf with the registry so its releases are indexed (`PUT /admin/shelves { name, kind:
"organization" }` on `seed-bible.svc`, `rebuild-serving-plane.md`). Done for `seed-reader.org` on 2026-10-22; the
reader's `seed.workspace.orgs` lists what a person stewards (their agent's `person.affiliations.list`).
