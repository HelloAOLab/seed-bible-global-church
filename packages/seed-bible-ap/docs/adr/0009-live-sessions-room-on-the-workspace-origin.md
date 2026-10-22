# ADR-0009: Live sessions are an Agents SDK room on reader-a2a's origin, admitted by one-time tokens

**Status:** accepted (2026-10-22) — first cut of realtime-collaboration.md; settles hard-problems §7 (first form)
and §8.

## Context

CasualOS gave every device one Yjs document over a websocket. On the estate, agents speak only A2A and people's
devices may talk only to reader-a2a's origin. A session must survive the room being wiped (the vault is the record)
and must admit nobody the host did not.

## Decision

1. **`ReadingSession` (Agents SDK `Agent`) on reader-a2a**, served at `/agents/reading-session/<id>` on the same
   origin as `/harness/*`. The synced `state` is the small session document (host, leader, passage, participants,
   this chapter's decorations, seq); the op log and chat are the object's SQLite; presence is a raw broadcast frame,
   ≤10 Hz per sender, never state.
2. **Acts open and admit.** `seed.session.start` (the host) first has the host's own agent keep the
   `seed:ReadingSession` record in their Library (`seed-bible/sessions/<id>.jsonld`, private), then creates the
   room and mints the host's invite. `seed.session.join` admits the host or anyone presenting the session's share
   code; a stranger gets 404. Both return a **one-time token** (5-minute life) the device presents on connect; the
   room marks it used in `onConnect`, and `shouldSendProtocolMessages` keeps the snapshot from an unadmitted socket.
3. **Roles are the room's, set by the host** (`setRole`): leader / navigator move everyone (`follow`), leader /
   decorator mark verses for everyone (`decorate`), anyone chats. Clients never `setState`; every change is a
   callable that checks the connection's admitted actor.
4. **The token travels in the WebSocket query string.** The rule said never; the browser's WebSocket API offers no
   header and cookies across origins fail on first use. What the rule guarded against (a long-lived token logged in
   URLs — Game Night P-06) does not apply: the token is single-use, minutes-lived, spent on the first connect, and
   useless after. Recorded here so the deviation is deliberate.
5. **Follow the leader is the state sync.** The leader's device calls `follow` when its own chapter changes; every
   other device moves its selected tab to the room's passage when the state arrives. Decorations render as
   outlined ribbons over the reader's own highlights.

## Consequences

- Chat is in the room's op log, not yet mirrored from the scope's messaging topic; the huddle dock, agent seats
  (`message/send` with a deadline), the SSE/long-poll fallback and standing from org/circle membership are later
  cuts of this ADR's shape.
- The record exists before the room, so a wiped room loses only serving-plane state (proven by `pnpm smoke:session`:
  wipe, then read the record through the host's agent).
- Rooms are reachable only through reader-a2a's origin; the workspace's internal marker guards the create /
  invite / snapshot / wipe lane.
