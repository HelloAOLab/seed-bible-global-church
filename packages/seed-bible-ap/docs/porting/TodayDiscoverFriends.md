# Porting `TodayManager`, `DiscoverManager`, `FriendsManager` (social, first cut)

Source (read-only): `managers/TodayManager.tsx`, `managers/DiscoverManager.tsx`, `managers/FriendsManager.tsx`,
`components/TodayPane`, `components/DiscoverPane`, `components/FriendsPane`.

| It did                                                       | With                                    | Now                                                                                                                                                                       |
| ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| friends' notes and reading read straight from `publicRead:*` | CasualOS records, world-readable        | **only what a friend published** (hard-problems §4 layer 1): `state/social/today.ts` asks the workspace for the friends' recent releases from the Seed registry, by owner |
| friend requests, accept, remove, 7-day expiry                | CasualOS friend records                 | the Home's contacts: `seed.workspace.contacts` → the reader's own agent's `person.contact.list` over the wire; adding people is done at the Home (link in the pane)       |
| Discover providers per chapter (extensions, Apologist …)     | `DiscoverManager` provider registry     | `state/social/discover.ts`: `seed.workspace.discover { passage }` — the registry's offerings for the chapter; a body is read through the workspace's public read lane     |
| publish / share a note                                       | `publicRead` on the record, share links | `state/social/publishing.ts`: the note as Markdown + descriptor to the reader's public shelf (`seed.publish.slice`), withdraw makes it private; the notes pane's button   |
| resume card, reading history timeline, heat map              | `ReadingHistoryManager`                 | resume from the open tab; history is not ported yet (needs `seed:ReadingEvent` buckets)                                                                                   |
| profile, gallery                                             | CasualOS profile record                 | the Home's name and address; photos wait for the file lane (step 7)                                                                                                       |

Dropped: fan-out reads of N friends' private records (impossible by design — the Library is private or public);
"crossed paths" folding; the community feed of reading events (would need published monthly slices, §4).
Circle shelves (§4 layer 2) and per-person share grants (layer 3) are not in this cut.

The first-run consent (§5): the account pane shows the Home link when the workspace's refusal names a missing
behaviour; the Home's own screens do the assignment. Device adoption (§6) is in `buckets.resync`.
