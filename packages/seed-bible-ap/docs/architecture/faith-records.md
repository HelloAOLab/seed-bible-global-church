# The person's faith records

_2026-11-03._ The reader serves the person beyond Scripture: their prayers, their faith journey and the care they
ask their church for. This page says where those records live, what shape they take, who writes and reads them, and
how sharing is decided.

## The short version

- **The person owns them.** The records live in the person's own vault at their Home. No app keeps its own copy.
  The Seed reader, the Church app and any later app all read and write the same records.
- **Their agent is the only writer.** Apps ask the person's agent (`person.faith.*` on the Home runtime) over the
  ask-as-me wire. No app holds a write grant on the vault.
- **The ontology is the standard.** The classes, fields, vocabularies and SHACL shapes are in the shared faith
  ontology (`~/skills` `ontology/faith.ttl`, section "The person's own faith records"; values and the next-step
  graph in `faith.data.ttl`). A record's keys are its shape's field names and its `@type` is the class IRI, so any
  skill can read it by its meaning.
- **Each record says who may see it.** The person's agent applies that rule in code before anything leaves it, and
  before any model reads anything. A record with no visibility is Confidential (only the person).

## The records

| What                     | Class (`fci:` = `https://ontology.faithchain.org/incubator#`) | Vault record type                   | Notes                                                                                                          |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Where I am on my journey | `fci:JourneyStageAssertion` ⊑ `at:Attestation`                | `faith.journey-stage:<id>`          | A new dated record each time; the current stage is the latest. Never overwritten.                              |
| A milestone I reached    | `fci:FaithMilestone` ⊑ `at:Attestation`                       | `faith.milestone:<id>`              | Baptized, professed faith, joined a group… with optional date, place and their story.                          |
| A prayer                 | `fci:PrayerRequest` ⊑ `at:Need`                               | `faith.prayer-request:<id>`         | A request or a thanksgiving. Status: `expressed` (praying), `fulfilled` (answered), `withdrawn`. Prayed count. |
| How it was answered      | `fci:AnsweredPrayerReport`                                    | `faith.answered-prayer:<prayer id>` | The person's words and the time.                                                                               |
| A request for care       | `fci:CareRequest` ⊑ `at:Need`                                 | `faith.care-request:<id>`           | Shared with one church's leaders only. Urgency; whether a text is OK.                                          |

The vocabularies are `fci:FaithJourneyStageValue` (nine stages, from ChurchCore's ladder, each a close match to C153's
growth status), `fci:FaithMilestoneValue` (seven, close matches to formation's pathway milestones),
`fci:SpiritualPracticeValue`, `fci:PrayerKindValue`, `fci:CareUrgencyValue` and `fci:PrayerVisibilityValue`. The next
steps for a stage come from ChurchCore's seeded journey graph, ported as `fci:nextStage`, `fci:stageRequires` and
`fci:unlocksStage`.

A removed record stays in the vault as a tombstone (`removedAt`), so a copy on another device cannot bring it back. It
is never shown or shared.

## Who may see what

| A record's visibility      | Who sees it                                                                     |
| -------------------------- | ------------------------------------------------------------------------------- |
| Confidential (the default) | Only the person.                                                                |
| Friends                    | Their friends. If the record names friends in `sharedWith`, only those friends. |
| BodyOnly                   | The members of the church named in `sharedWith`.                                |
| LeadersOnly                | The leaders of the church named in `sharedWith`.                                |
| Open                       | Anyone the person shares with.                                                  |

A care request is always LeadersOnly for the one church it names. Only the current journey stage is ever shared,
never the history of earlier ones.

`person.faith.shared.view { audience: friends | church | leaders, church?, friend?, purpose }` returns exactly what
that audience may see, plus a count of what it held back, so the caller knows the view is partial without knowing
what it left out.

## The tools

On the Home runtime (ap-home `apps/agent-runtime/src/faith-records.ts`, PR #87):

| Tool                          | Kind | Does                                                                 |
| ----------------------------- | ---- | -------------------------------------------------------------------- |
| `person.faith.journey.get`    | read | Stage, history, milestones, next steps. The person's own view.       |
| `person.faith.journey.record` | act  | A stage, or a milestone, or `remove: <id>`.                          |
| `person.faith.prayers.list`   | read | Prayers with answers, and care requests. The person's own view.      |
| `person.faith.prayer.save`    | act  | Add or edit, `prayed`, `answered`, `status`, `visibility`, `remove`. |
| `person.faith.care.request`   | act  | A care request for a church's leaders, or `withdraw`.                |
| `person.faith.shared.view`    | read | What one audience may see.                                           |

The acts are self-acting: the person's own words, on their own turn, never plan steps. Their contracts are in
`~/skills/skills/faith/person-*` (journey-read, journey-record, prayer-read, prayer-record, care-request,
faith-shared-view). `scripts/register-person-faith.mjs` publishes them and attaches them to the person-steward
archetype.

In the reader, `apps/reader-a2a/src/skills/faith.ts` adds the `seed.faith.*` workspace tools. Each one forwards one
step to the matching person tool and drops any argument that tool does not take. `seed.faith.churches` lists the
churches the person belongs to (`person.affiliations.list`, type church). The page is
`apps/reader-web/src/components/faith/FaithPane.tsx`: Prayer, Journey and Care.

## For the Church app and other apps

- **Write through the person's agent**, with the same tools. The Church app's `church.journey` and `church.prayer`
  records (free text, written straight to `vault:church.*`) should move to these. A one-time read adapter can import
  them, keeping the originals.
- **Before answering a faith question as the person**, ask `person.faith.shared.view` with the audience the answer
  goes to (the church's agent, say). The person's own reads (`journey.get`, `prayers.list`) are for showing the
  person, never for passing on.
- **The church's side stays the church's.** A care case, its assignment and its notes live in the church's vault and
  point back to the person's care request. They are never copied into it.

## Where this meets `faith.context.prepare`

The Church app's developer is building `faith.context.prepare` on the same runtime (ap-church `specs/201` and
ap-home branch `codex/church-faith-ask`). In that design, an app keeps a manifest of pointers and release rules
(`faith.context:manifest`), and the agent releases fields only to recipients the manifest names.

The two designs agree on everything that matters: the person's own agent decides, filtering happens in code before
any text leaves, and nothing is inferred. Three points need joining up:

1. **Record names.** Their key check accepts `faith.(journey|prayer|reading|preference):`. These records are
   `faith.journey-stage:`, `faith.milestone:`, `faith.prayer-request:`, `faith.answered-prayer:` and
   `faith.care-request:`, one per class, as the record-type rule asks. Their check should accept the faith record
   types named in the playbook's `domainRecords`, or `faith\.[a-z-]+:`.
2. **Where the release rule lives.** Here it is on each record (`visibility` + `sharedWith`). There it is in the
   manifest. The simplest join is for the faith acts to keep the manifest entry for each record in step with its
   visibility, so one tool writes both and they cannot drift.
3. **Who counts as a receiver.** Their check requires every receiver to be listed, including the app's own delegate
   and any agent the request is routed through. A prayer shared with "my church" names the church's agent, not the
   Church app's workspace key. This is a policy decision for the owner.

`vault:faith.*`, added to the Home's app scopes in PR #87, covers their manifest record too.

## Not done yet

- **Each person's playbook needs re-pinning.** Live since 2026-11-04: the runtime (deployed from the Church app's
  branch, which includes master), the Home's faith scope, and the reader. Seed Reader passes PY1–PY3 on the live
  site. Anyone else needs a grant that carries `vault:faith.*` (the Home re-issues it at sign-in) and a person-steward
  playbook at definition `0x83970be5…` or later (`scripts/assign-playbook.mjs <handle>` for a sample person).
- **The contract and runtime actions differ.** The registry's contracts say `action=execute`; the runtime's tools say
  `record`/`save`/`request`, so the contract text is not merged into them. Align them on the next runtime deploy.
- **Old records are not moved yet.** Moving ChurchCore's journey data and the Church app's `church.journey` /
  `church.prayer` records is not done.
- **YouVersion features still to come.** Guided Prayer, a prayer-time streak, and friends praying for each other
  (`fci:PrayerCommitment`) are next.
