# Seed domain ontology

Seed Bible's domain words live in the **`~/skills` ontology folder** (domain `seed`), not in CasualOS markers and not in `@agenticprimitives/ontology`. The substrate ontology stays generic (ADR-0018, ADR-0021). `seed:` is a **vertical T-box** that grounds on the skills repo's upper layers, exactly as `scripture`, `bible-translation`, and `heart-coach` do.

- `~/skills/ontology/seed.ttl` — T-box + SHACL shapes
- `~/skills/ontology/seed.clusters.ttl` — `at:SemanticCluster` view (every class in one cluster, ≤12 per cluster)
- `~/skills/ontology/seed.data.ttl` — C-box values, A-box examples, and the agentic layer (capabilities, skills, archetypes)
- `~/skills/ontology/seed.cq.ttl` — optional competency questions
- Repo registration: `scripts/preflight.py DOMAINS`, `scripts/sync_ontology.py CONTEXTS` (without these no gate runs and nothing reaches GraphDB)
- Draft: [`seed.ttl.md`](./seed.ttl.md)

## Namespace and dependency direction

```
seed:  https://skills.demo/seed#          (repo convention: https://skills.demo/<domain>#)
ex:    https://skills.demo/seed/example#
graph  <urn:skills:context:seed>, data <urn:skills:context:seed:data>
```

`seed → scripture → { publishing, commerce, faith(gc:) } → agentic-trust → { prov, dul, p-plan }`. Seed may reach **up** into any of these; none may reference `seed:` (enforced by `check_domain_firewall`).

## Upper layers we use, not copy

| Prefix                                           | What we reuse                                                                                                                                                                                                          | Why                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at:` (`agentictrustlabs.dev/ns/agentic-trust#`) | `at:KnowledgeRecord` (every private record), `at:Activity`, `at:Situation`, `at:Delegation`, `at:Category`, `at:Person`, `at:Organization`, `at:ChurchAgent`, `at:CircleAgent`, `at:WorkspaceAgent`, `at:ServiceAgent` | Grounding must reach `at:` or a foundational ns; `ap:` / `apsit:` / `schema:` are not on preflight's list. `at:` mirrors the AP ontology via `rdfs:seeAlso` |
| `scr:` (scripture)                               | `scr:Verse`, `scr:Passage` (a range or chapter), `scr:ScriptureEdition` (a translation), `scr:ScriptureCorpus`, `scr:VerseText`                                                                                        | **No second verse model.** `seed:Locus` is dropped                                                                                                          |
| `pub:` (publishing)                              | `pub:ContentWork` for Playlist, ReadingPlan, Offering, Customization                                                                                                                                                   | Revisions, renditions, releases, canonical ids come free; this is what the Library publish path produces                                                    |
| `gc:` / `fci:` (faith)                           | `gc:EkklesiaCommunity` / `gc:AgentiveEkklesia`, `fci:CongregationMembership`                                                                                                                                           | The body behind a `.church` when a congregation term is needed                                                                                              |
| `oa:`                                            | `rdfs:seeAlso oa:Annotation` on Highlight / Annotation                                                                                                                                                                 | Foundational; subclass only if `ontology/upper/web-annotation.ttl` declares it                                                                              |
| `prov:`, `skos:`                                 | Attribution and controlled lists                                                                                                                                                                                       | Foundational                                                                                                                                                |

Do not put Seed Bible classes into `ap:` or `at:`. Do not re-describe contacts as `seed:friendOf`.

## Domain classes

| Class                                                                                                         | Upper                | Meaning                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `seed:Highlight`                                                                                              | `at:KnowledgeRecord` | A colored mark on a passage; `seed:heldBy` exactly one `at:Person`                                   |
| `seed:Annotation`                                                                                             | `at:KnowledgeRecord` | A note (rich text), optional `seed:replyTo`, `seed:tag`, `seed:order`                                |
| `seed:Bookmark`                                                                                               | `at:KnowledgeRecord` | A movable named place (`seed:bookmarkName`, color)                                                   |
| `seed:Save` + `seed:SaveCategory`                                                                             | `at:KnowledgeRecord` | A saved verse/passage in a category                                                                  |
| `seed:ReadingPosition`                                                                                        | `at:KnowledgeRecord` | Where the person is now                                                                              |
| `seed:ReadingEvent`                                                                                           | `at:Activity`        | One history event; identity `(agent, passage, startedAt)`; `seed:startedAt`, `seed:endedAt`          |
| `seed:ReaderSettings`                                                                                         | `at:KnowledgeRecord` | Theme, fonts, toolbar, language, tutorial and onboarding flags (today `profile.config`)              |
| `seed:Profile`                                                                                                | `at:KnowledgeRecord` | Display name, location, bio, picture (extra to the Home profile)                                     |
| `seed:PlanProgress` + `seed:SessionProgress`                                                                  | `at:KnowledgeRecord` | Progress on a plan: cadence, self-paced, time zone, completed readings, partial chapters             |
| `seed:CustomizationSelection`                                                                                 | `at:KnowledgeRecord` | Chosen customization + variant, extra/removed extensions                                             |
| `seed:ExtensionBinding`                                                                                       | `at:KnowledgeRecord` | Installed extension and non-secret settings                                                          |
| `seed:SecretRef` + `seed:ProxyEndpoint`                                                                       | `at:KnowledgeRecord` | Pointer to a vault secret; host, visibility (private / public-run), request mapping; never the value |
| `seed:McpServerBinding`                                                                                       | `at:KnowledgeRecord` | External MCP connector (url, enabled, credential → SecretRef)                                        |
| `seed:GalleryImage`                                                                                           | `at:KnowledgeRecord` | An uploaded image (`schema:contentUrl` as seeAlso, sha256)                                           |
| `seed:PlaylistPlay`                                                                                           | `at:Activity`        | Play history (playlist, step, duration)                                                              |
| `seed:Playlist` + `seed:PlaylistItem` (`ScriptureItem`, `HtmlItem`, `LinkItem`)                               | `pub:ContentWork`    | Ordered passages and media; private until published                                                  |
| `seed:ReadingPlan` + `seed:PlanSession`, `seed:PlanReading`, `seed:CadenceOption`                             | `pub:ContentWork`    | A scheduled set of passages (plan + metadata)                                                        |
| `seed:Customization` + `seed:ThemeVariant`, `seed:ExtensionSettingDefault`                                    | `pub:ContentWork`    | An org's branded reader; `seed:providesSecret` → SecretRef                                           |
| `seed:Offering`                                                                                               | `pub:ContentWork`    | Chapter-scoped content an org or person offers                                                       |
| `seed:ReadingSession` + `seed:SessionOptions`                                                                 | `at:Situation`       | A live shared reading; host, co-hosts, allowed navigators/decorators; presence is serving-plane      |
| `seed:ShareGrant`                                                                                             | `at:Delegation`      | Evidence that another agent may read a private slice; never a gate input                             |
| `seed:HighlightColor`, `seed:OfferingKind`, `seed:SessionRole`, `seed:Visibility` (world / friends / private) | `at:Category`        | Controlled lists, values as `seed:<class>-<notation>` in `seed.data.ttl`                             |

Not vault classes: the session document (serving-plane), the offline IndexedDB mirror (reader-web cache), chat messages (messaging envelopes with a `scr:Passage` context ref).

## Object properties

| Property                                              | Range                                      | Note                                                                                          |
| ----------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `seed:aboutPassage`                                   | `scr:Passage`                              | What a mark, event, or offering is about (`seed:aboutVerse` → `scr:Verse` when verse-precise) |
| `seed:ofEdition`                                      | `scr:ScriptureEdition`                     | The translation (do not reuse `scr:inEdition`; its domain is `scr:VerseText`)                 |
| `seed:heldBy`                                         | `at:Person`                                | `rdfs:subPropertyOf prov:wasAttributedTo`; never the workspace or the service                 |
| `seed:publishedBy`                                    | `at:Organization` or `at:Person`           | `rdfs:subPropertyOf prov:wasAttributedTo`                                                     |
| `seed:visibility`                                     | `seed:Visibility`                          | Explicit; the CasualOS `publicRead` default becomes a decision                                |
| `seed:selectedCustomization` / `seed:selectedVariant` | `seed:Customization` / `seed:ThemeVariant` |                                                                                               |
| `seed:offeredForPassage`                              | `scr:Passage`                              | What Discover indexes                                                                         |
| `seed:sessionOf` / `seed:participant` / `seed:host`   | `scr:Passage` / `at:Agent`                 |                                                                                               |
| `seed:grantedTo`                                      | `at:Agent`                                 | Check the tbox §4/§11.3 delegatee property before minting                                     |
| `seed:progressOf`                                     | `seed:ReadingPlan`                         |                                                                                               |
| `seed:replyTo`                                        | `seed:Annotation`                          |                                                                                               |

## Skills bind to the T-box

Each capability in [agents-and-skills.md](./agents-and-skills.md) names the class it produces (`evidence.produces`, `cil:producesClass`) and consumes (`scr:Passage`). Every produced class needs a `sh:NodeShape` with at least one required field beyond `rdfs:label` (`check_produced_class_shapes`). The planner must not invent an untyped blob.

## Vault shape

A record is a Library artifact: JSON-LD, `@type` a `seed:` class, under `seed-bible/<collection>/` in the person's or org's Library, `accessPolicy` private by default. `seed:aboutPassage` is an OSIS reference in a named edition, not `publicRead:annotations/JHN/3`. No CasualOS `recordName` / `marker`. IndexedDB in reader-web may cache the same shape; it is not the record.

## Visibility decision (scope change from CasualOS)

In CasualOS every reader record was `publicRead`; the `friends` permission gated nothing. Here marks are **private by default**. "Friends can see" is `seed:ShareGrant` to a contact or a `.circle`, or `seed.publish.slice` to the public shelf. Today and Discover read what is granted or published, nothing else.

## Town projection

The town graph holds agent facets, card skills, and released **markdown** shelf passages — never `seed:` descriptors (JSON-LD shelf pages are withdrawn from projection). Structured works are found through the `seed-bible.svc` Seed registry. The discovery indexer is the only writer of the town graph.

## Registration

`node scripts/register-seed.mjs` (context row, T-box PUT, skills, capabilities, archetypes), then `sync_ontology.py push`, `load_data_graph.py seed --apply`, `sync_ontology.py export`, gate `preflight.py --live`. Owner (`skills:owner`) is the custodian persona; until one exists the domain lands under `demo-admin`. When the T-box is stable, register terms on faithchain's `OntologyTermRegistry`.
