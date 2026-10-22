// THE SESSION DOCUMENT — what a live reading room syncs to every device (ADR-0009). Shared by the room on
// reader-a2a and the device client in reader-web, so neither imports the other.
export interface SessionPassage {
  translationId: string;
  bookId: string;
  chapterNumber: number;
}

export type SessionRole = "leader" | "navigator" | "decorator" | "reader";

export interface Participant {
  agent: string;
  name: string;
  role: SessionRole;
  connections: number;
  /** A guest came in with the share code and no Home; `agent` is `guest:<id>`, good for this session only. */
  guest?: boolean;
  /** On the session's voice right now (peer-to-peer audio, signalled through the room). */
  voice?: boolean;
}

export interface Decoration {
  id: string;
  by: string;
  chapter: string;
  start: number;
  end: number;
  colorId: string;
  at: string;
}

export interface SessionState {
  id: string;
  host: { agent: string; name: string } | null;
  leader: string | null;
  passage: SessionPassage | null;
  participants: Participant[];
  decorations: Decoration[];
  /** Whether the host lets guests (people without a Home) in with the share code. */
  allowGuests?: boolean;
  seq: number;
  startedAt: string | null;
  endedAt: string | null;
  recordRef: string | null;
}
