# Porting `SessionsManager` (live sessions, first cut)

Source (read-only): `managers/SessionsManager.tsx` (1,973 lines, Yjs over a CasualOS inst), `components/SessionParticipants`,
`SessionQRCode`, `ChatView`, the session settings in `Tabs.tsx`.

| It did                                                           | With                          | Now                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| one Yjs document per shared tab, joined by websocket to the inst | CasualOS `getSharedDocument`  | `ReadingSession` room (Agents SDK) on reader-a2a; `backend/room.ts` is the device's client (ADR-0009)                  |
| host/co-host, "only host can navigate / highlight" options       | session options in the doc    | roles on the room: leader / navigator / decorator / reader, set by the host (`setRole`)                                |
| follow the leader (position, tab, translation)                   | shared reading state          | `follow` by the leader; devices move their selected tab to the room's passage (`state/sessions/live.ts`)               |
| verse decorations and selection flares broadcast to peers        | `decorations` in the doc      | `decorate` / `undecorate`; drawn as outlined ribbons (`sb-highlight-ribbon-broadcast`) over the reader's own           |
| presence (who, where)                                            | awareness                     | `presence` frames (≤10 Hz), shown in the session pane roster                                                           |
| chat per session (`ChatsManager`)                                | CasualOS records              | `chat` in the room's op log (the scope's messaging topic later)                                                        |
| QR code / share link                                             | `SessionQRCode`               | the share link `?session=<id>&code=<code>` (joined after sign-in); the QR image later                                  |
| anonymous guests                                                 | CasualOS guest ids            | **not yet** — joining needs a Home sign-in (hard-problems §6)                                                          |
| the session as a record                                          | none (the inst was the state) | `seed:ReadingSession` kept by the host's agent in their Library before the room exists; `seed.session.record` reads it |

Dropped: Yjs; the inst; shared tabs/panes (one passage per session for now); the mobile participants stack.
Proof: `scripts/smoke/session.ts`.
