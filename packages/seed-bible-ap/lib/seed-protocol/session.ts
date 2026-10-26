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

/** The host's session settings (the old reader's Session settings window). */
export interface SessionSettings {
  /** Only the host, co-hosts and those given Navigate move the passage; off, everyone does. */
  hostOnlyNavigate: boolean;
  /** Only the host, co-hosts and those given Highlight decorate; off, everyone does. */
  hostOnlyHighlight: boolean;
  /** How long someone else's highlight stays on each screen; null keeps it. */
  highlightSeconds: number | null;
  /** Whose verse taps flare on everyone's screen. */
  selectionEffects: "hosts-only" | "everyone" | "none";
  /** Everyone reads one translation (the mover's); off, each keeps their own. */
  shareTranslation: boolean;
}

/** The old reader's defaults. */
export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  hostOnlyNavigate: false,
  hostOnlyHighlight: false,
  highlightSeconds: 16,
  selectionEffects: "hosts-only",
  shareTranslation: false,
};

export interface SessionState {
  id: string;
  host: { agent: string; name: string } | null;
  leader: string | null;
  passage: SessionPassage | null;
  participants: Participant[];
  decorations: Decoration[];
  /** Whether the host lets guests (people without a Home) in with the share code. */
  allowGuests?: boolean;
  /** Absent in a session started before settings: the defaults. */
  settings?: SessionSettings;
  /** People who share the host's powers (settings, navigation, highlighting); never a guest. */
  coHosts?: string[];
  seq: number;
  startedAt: string | null;
  endedAt: string | null;
  recordRef: string | null;
}

/** The host, a co-host, or the leader: who may change settings and always moves and highlights for the room. */
export function isHostish(state: SessionState, agent: string | null): boolean {
  if (!agent) return false;
  return (
    state.host?.agent === agent ||
    state.leader === agent ||
    (state.coHosts ?? []).includes(agent)
  );
}

export function settingsOf(state: SessionState | null): SessionSettings {
  return { ...DEFAULT_SESSION_SETTINGS, ...(state?.settings ?? {}) };
}

/** Whether this person may move the passage for everyone. */
export function canNavigate(
  state: SessionState,
  agent: string | null
): boolean {
  if (!agent) return false;
  if (isHostish(state, agent)) return true;
  const role = state.participants.find((p) => p.agent === agent)?.role;
  if (role === "navigator") return true;
  return !settingsOf(state).hostOnlyNavigate;
}

/** Whether this person may highlight for everyone. */
export function canDecorate(
  state: SessionState,
  agent: string | null
): boolean {
  if (!agent) return false;
  if (isHostish(state, agent)) return true;
  const role = state.participants.find((p) => p.agent === agent)?.role;
  if (role === "decorator") return true;
  return !settingsOf(state).hostOnlyHighlight;
}
