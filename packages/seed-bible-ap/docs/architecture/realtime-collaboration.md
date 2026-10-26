# Real-time collaboration and integrations, through A2A, on Cloudflare

CasualOS gave Seed Bible one shared "inst": a Yjs document every device joined over a websocket, so people could drive one reading UX from several machines (follow the leader, shared tabs, presence, highlights and decorations, chat). This document says how that comes back on the estate: **agents speak only A2A**, **people's devices join a Cloudflare Durable Object room served by the A2A host's own origin**, and every integration (Apologist, audio-reader, Bonfire, compare, Twitch, transcripts, external MCP, …) rides the same two paths.

## Precedents we copy

### Game Night (`~/pokernight`, [gamenight.faithnet.io](https://gamenight.faithnet.io/))

The estate's own realtime, multi-user, agent-to-agent app, live on faithnet. What it settled:

| Pattern                                                                                                                                                                                                                                                                            | Where                                        | We copy it as                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **One origin.** The browser talks only to the tables Worker; it never fetches an agent card, never POSTs `/api/a2a`, never opens a socket to an agent host                                                                                                                         | `docs/HOLDEM-COACH.md` §3                    | reader-web talks only to reader-a2a's origin                                                                 |
| **Humans on hibernatable WebSockets to a DO; agents over A2A.** `PokerTableDO` (SQLite, alarms, hibernation API); an agent seat gets `message/send` on the **standard** A2A profile with a `deadlineMs` alarm; from the engine's view a human seat and an agent seat are identical | `DESIGN.md` §6–7, `table-do.ts`              | `ReadingSessionDO`; a participating agent (study companion, org assistant) is asked over A2A with a deadline |
| **Admission is huddle-shaped.** The DO is the serving-plane object for a scope (`{kind:'workspace', principal: club, id: table}`); standing derived by the Worker; invitations as a ground; empty-room grace; a stranger gets 404 not 403                                          | `WORKSPACES.md` §6.2                         | session scope = circle / org / conversation; same table                                                      |
| **A club is a `.workspace` the host custodies at Home; the app keeps nothing but the wire**                                                                                                                                                                                        | `AUDIT` §2.3                                 | a reading circle is a `.circle` org agent; reader keeps only the wire                                        |
| **Advise / record / review.** The person's own agent _consults_ a coach service under a study grant; a finished hand is `poker.record`ed to the person's agent over the house wire (`harness.ask`); a review is the person's question forwarded to the coach                       | `HOLDEM-COACH.md`, `ARCHITECTURE-ADVISER.md` | `seed.advise` / `seed.record` / `seed.review`: Bonfire becomes the person's agent consulting a study service |
| **Presence room.** `SceneDO`: who is where, pose ≤10 Hz dropped if stale, `people` deltas batched per 100 ms, `say` kept nowhere, hibernation = zero idle cost; video = one RealtimeKit meeting per room                                                                           | `SPATIAL-ROOM.md` §3.2–3.3                   | presence and cursors in `ReadingSessionDO`; voice = huddle                                                   |
| **Fairness and replay.** Append-only action log, every agent request/reply logged with task id                                                                                                                                                                                     | `DESIGN.md` §7                               | session op log with `seq`, every A2A ask logged with task id                                                 |
| Known weaknesses to avoid: WebSocket token in the query string (P-06), session material in browser storage (P-07), one session key as delegate for every wire (P-02)                                                                                                               | `AUDIT-2026-09-13.md`                        | token in the first WS frame or a short-lived cookie; per-person wires                                        |

### Cloudflare realtime building blocks

| Block                                                                                                                                                                                                                                                                                                                                                             | Gives us                                                                                           | Docs                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable Objects, hibernatable WebSockets, SQLite, alarms                                                                                                                                                                                                                                                                                                          | One object per session, zero idle cost, ordered state, timers (turn clocks, empty-room grace)      | [Durable Objects](https://developers.cloudflare.com/durable-objects/)                                                                                                                                                                                                                                                                                 |
| **Agents SDK** (`agents`): `Agent` class with SQLite-backed `state` auto-synced to every connection (`setState`, `validateStateChange`), `broadcast`, `@callable()` RPC incl. streaming, `schedule()` / `scheduleEvery()`, resumable streaming, readonly connections, cross-domain WebSocket auth, `useAgent` client hook (works with Preact via `preact/compat`) | The session document synced to every device with no CRDT code; follow-the-leader is one `setState` | [Agents SDK](https://developers.cloudflare.com/agents/), [WebSockets](https://developers.cloudflare.com/agents/api-reference/websockets/), [Store and sync state](https://developers.cloudflare.com/agents/api-reference/store-and-sync-state/), [Readonly connections](https://developers.cloudflare.com/agents/api-reference/readonly-connections/) |
| PartyServer / `y-partyserver`                                                                                                                                                                                                                                                                                                                                     | Yjs on a DO when a surface truly needs multi-writer text (co-editing one note)                     | [PartyServer](https://github.com/cloudflare/partykit)                                                                                                                                                                                                                                                                                                 |
| RealtimeKit                                                                                                                                                                                                                                                                                                                                                       | Audio/video for huddles (already the estate's choice, spec 378)                                    | [RealtimeKit](https://developers.cloudflare.com/realtime/)                                                                                                                                                                                                                                                                                            |
| Queues                                                                                                                                                                                                                                                                                                                                                            | The record path: session events → vault writes without blocking the room                           | [Queues](https://developers.cloudflare.com/queues/)                                                                                                                                                                                                                                                                                                   |
| Web Push (Agents SDK push)                                                                                                                                                                                                                                                                                                                                        | "Richard started a reading" to a friend's device                                                   | [Push notifications](https://developers.cloudflare.com/agents/api-reference/push-notifications/)                                                                                                                                                                                                                                                      |

What the estate has today for comparison: Home long-polls `/harness/progress`; the discussion board is cursor long-poll; A2A streaming (`SendStreamingMessage` / `SubscribeToTask`) is implemented in `@agenticprimitives/a2a` but every card says `streaming: false`; huddles use `HuddleRoomDO` + RealtimeKit; `@agenticprimitives/collaboration` holds the huddle contracts.

## The rule

1. **Agents speak only A2A.** The person agent, org agent, study companion, and `seed-bible.svc` are reached with `SendMessage` / `SendStreamingMessage` on the standard surface (or the `/harness/ask` fold). reader-a2a turns `streaming: true` on and streams run progress and `AnswerDraft` over SSE.
2. **People's devices join a room on the A2A host's origin.** reader-a2a's Worker serves `ReadingSessionDO` (Agents SDK `Agent`) at `/agents/reading-session/<sessionId>` on the same origin as `/api/a2a` and `/harness/*`. The browser opens a WebSocket there with a **one-time session token minted by the A2A join act** (huddle-shaped: returned once, never in a URL, never in a receipt). No second origin, no second control plane.
3. **The room holds serving-plane state; the vault holds the record.** `state` = session document (`leader`, `passage`, `edition`, `panes[]`, `tabs[]`, `decorations[]`, `participants[]`, `seq`), rebuildable if wiped (ADR-0055). The record is `seed:ReadingSession` in the host's Library, the scope's messaging thread, and receipts. Highlights made _in_ a session still land in each person's own Library via the person's agent (ask-as-me plan) — queued from the room, not blocked on it.
4. **Standing decides.** The Worker derives the caller's standing at the scope (party to a conversation, member/steward of an org / `.circle`, or an unexpired invitation) the way huddles and poker tables do, and hands the DO `{ actor, standing }`. Roles (`leader`, `navigator`, `decorator`) are assigned by granted acts, never a client flag. A stranger gets 404.
5. **Agents in the room are seats.** A study companion or the org's assistant is a participant whose "device" is an A2A endpoint: the DO sends it `message/send` with the redacted room view and a deadline alarm, exactly as `PokerTableDO` asks `poker.act`.

## The session, end to end

```mermaid
sequenceDiagram
  participant Dev as device (reader-web)
  participant WA as reader-a2a Worker (A2A host + room origin)
  participant Room as ReadingSessionDO (Agents SDK)
  participant PA as person agent A2A
  participant Coach as study companion A2A

  Dev->>WA: harness/ask session.start {scope: x.circle}  (id_token)
  WA->>WA: derive standing at x.circle; plan seed.session.host
  WA->>Room: create {scope, host, standing}
  Room-->>WA: sessionId + one-time join token
  WA-->>Dev: join card (sessionId, token)
  Dev->>Room: WebSocket /agents/reading-session/<id> (token in first frame)
  Room-->>Dev: state snapshot (seq n)
  Dev->>Room: callable follow / position / decoration / presence
  Room->>Room: validate role, apply, seq++, setState
  Room-->>Dev: state delta to every device (two machines, one person = two connections)
  Dev->>WA: harness/ask highlight John 3:16
  WA->>PA: harness.ask (ask-as-me wire) plan library.file.save seed-bible/highlights
  PA-->>WA: receipt
  WA->>Room: decoration {highlight, by: person}  (so the room shows it)
  Room->>Coach: message/send seed.advise {view, deadlineMs}
  Coach-->>Room: {say, because}
  Room-->>Dev: coach bubble
```

- **Follow the leader / one UX across machines.** The session document is Agents SDK `state`; `setState` from the leader fans out to every connection; a late joiner gets the snapshot on connect; `validateStateChange` enforces roles. No CRDT needed for position, panes, decorations, presence. If co-editing a single note is wanted later, that note gets a `y-partyserver` document keyed by the session, still on the same origin.
- **Presence and cursors.** Pose/selection at ≤10 Hz, dropped if older than the last, `people` deltas batched per 100 ms (SceneDO numbers). Heartbeats slow. Readonly connections for spectators.
- **Devices.** One person on two machines is one actor with two connections; the roster shows one person (huddle's five-things rule).
- **Chat.** Not a bespoke table. The scope's InteractionsDO topic via the person's messaging grant with a `ContextRefV1 { kind: 'scr:Passage', id }` on each envelope; the room mirrors new topic messages into `state.chat` (spec 375 trigger) so a reader sees one timeline. Ephemeral "say" bubbles are kept nowhere.
- **Voice.** A huddle (spec 378) scoped to the same `.circle` / org / conversation; one RealtimeKit meeting per session; the reader shows the dock.
- **Fallback.** When WebSockets are blocked, the same room exposes the op log as A2A `SubscribeToTask` SSE and a cursor long-poll (`after=seq`). One log, three reads.

## Agents talking to agents

- **Study companion (Bonfire's new shape).** The person's own agent consults a study service (`seed-study.svc`, or an org's assistant) under a study grant: `seed.advise` (what should I notice here), `seed.record` (keep how this reading went — fire-and-forget to the person's agent), `seed.review` (the person's question over their own records). The room asks with a deadline; the panel says whose answer it is showing. An org's Bonfire persona is the org agent's discussion turn (spec 327) in the chapter topic.
- **Invite a friend into a session**: person agent → `person.contact.*` / interaction case; the invitee's Home shows "join reading with Richard"; Web Push from the room if they opted in.
- **Ask the church**: @-mention the org in the chapter topic; the org's own agent replies under its playbook (one tool, posts as the org); routed consultation (spec 329/380) when it consults member agents.
- **Hopenet visitor**: nothing until a door exists for reader-a2a (see [agents-and-skills.md](./agents-and-skills.md)).

## Gamification (from Game Night's missions pattern)

Streaks, plan completions, chapters-read-together, circle milestones. Computed by the **person's agent** from their own `seed:ReadingEvent` history (never by the room, which forgets), shared to a circle by `seed.publish.slice`, optionally attested (`at:` attestation) when an org wants to recognise it. A circle leaderboard is a read over what members published, not a table the service owns. No tokens, no wagers.

## Integrations, each on one of the two paths

The extension host in reader-web stays, but an extension no longer fetches third-party APIs with keys from the browser. It emits intents to reader-a2a; the workspace plans a skill on the right principal.

| Integration (today)                                                                                                | Kind                                | Path on the estate                                                                                                                                          | Principal / skill                                    |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Apologist, default-content, theographic, Discover contributors                                                     | Chapter-scoped content              | Org agent publishes `seed:Offering` to its public shelf; `seed-bible.svc` Seed registry indexes by passage; reader asks `seed.workspace.discover`           | **org** `seed.content.offer`; **workspace** discover |
| Bonfire AI (`AIManager`, `ChatView`)                                                                               | Conversational ask                  | Study companion over A2A (`seed.advise/record/review`) plus `/harness/ask` streamed progress + `AnswerDraft`; org persona = org discussion turn             | **person** ask → companion; **org** discussion turn  |
| Compare translations, references, locations                                                                        | Browser-local data                  | Unchanged; no principal                                                                                                                                     | —                                                    |
| Audio reader, text-to-speech, audio playback                                                                       | Browser-local                       | Unchanged; org-hosted audio is a `seed:Offering`                                                                                                            | —                                                    |
| Transcripts (`transcript-extension`, `transcript-ui-extension`; today `os.client.aiChat` + a Netlify key endpoint) | Needs a credential + server-side AI | `seed.secret.put` once; `seed.workspace.proxy` forwards via `seed.secret.use`; the AI call is a harness step on reader-a2a                                  | **person** secret; **workspace** proxy               |
| Twitch host / subscriber (today tokens in `localStorage`)                                                          | Credential + live events            | Secret + proxy for the Twitch API; the host's overlay is a room `decoration`, so subscribers follow through the room, not Twitch                            | **person** secret; **workspace** proxy; room ops     |
| External MCP servers (`mcp-extension`; today headers in a private record)                                          | Person's own tools                  | Connector on the **person agent** (ap-home `mcp-connector.ts`, Streamable HTTP) invoked inside the person's own harness; browser never calls MCP (ADR-0044) | **person** connector grant                           |
| Scripture Map, Bible Stack, House of the Lord                                                                      | Visualizations                      | Read `seed:ReadingEvent` lists via person skills; a shared walk-through is room state (SceneDO shape)                                                       | person list; room ops                                |
| Example / refresh extension                                                                                        | Template                            | Emits an intent; nothing else                                                                                                                               | —                                                    |

Only Apologist and the example extension use CasualOS sensitive proxies today; MCP and Twitch do not. A customization can **recommend** integrations; the person's agent still admits each skill under its own grant.

## What changes in the other documents

- reader-a2a's Worker gains the **`ReadingSessionDO`** (Agents SDK) and `streaming: true`; `seed-bible.svc` keeps files, caches, the Seed registry, and may host the room instead if reader-a2a must stay stateless — the origin the browser sees is still reader-a2a (service binding).
- `seed:ReadingSession` stays an `at:Situation`; the session document gets no ontology class.
- Feature-map rows for live sessions, chat, Bonfire, Twitch, transcripts, external MCP point here.

## What we do not do

- No second control plane: the room admits nothing the A2A act did not grant; it never signs, never grants, never holds a key.
- No Yjs document as the record; the Library and the messaging thread are the record; the room is a rebuild.
- No browser-held third-party keys; no WebSocket token in a URL; no session material in `localStorage`.
- No per-feature polling endpoints. One op log per session; WebSocket, SSE, or cursor long-poll read it.
