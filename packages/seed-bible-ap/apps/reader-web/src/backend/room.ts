// THE ROOM CLIENT — a device's WebSocket to a reading session on reader-a2a's origin (Agents SDK client). The
// one-time token from the join act goes on the connect request and is spent there; the session document arrives
// as state updates, chat and presence as raw frames. Dev: through Vite's `/a2a` proxy (ws: true).
import { AgentClient } from "agents/client";
import { A2A_BASE } from "../api";
import type {
  SessionPassage,
  SessionRole,
  SessionState,
  SessionSettings,
} from "@seed/seed-protocol/session";

export type { SessionState, SessionPassage, SessionRole, SessionSettings };

export interface ChatFrame {
  t: "chat";
  seq: number;
  at: string;
  by: string;
  name: string;
  text: string;
}
export interface PresenceFrame {
  t: "presence";
  by: string;
  name: string;
  verse: number | null;
  /** The chapter and verses on the sender's screen, when it says. */
  chapter?: string;
  from?: number;
  to?: number;
  at: number;
}
export interface VoiceFrame {
  t: "voice";
  by: string;
  name: string;
  on: boolean;
}
export interface RtcFrame {
  t: "rtc";
  from: string;
  to: string;
  payload: unknown;
}
export type RoomFrame = ChatFrame | PresenceFrame | VoiceFrame | RtcFrame;

export interface RoomHandlers {
  onState: (s: SessionState) => void;
  onFrame: (f: RoomFrame) => void;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
}

export interface Room {
  follow(p: SessionPassage): Promise<number>;
  decorate(d: { start: number; end: number; colorId: string }): Promise<string>;
  undecorate(id: string): Promise<number>;
  chat(text: string): Promise<number>;
  chatPage(afterSeq?: number): Promise<ChatFrame[]>;
  presence(
    verse: number | null,
    view?: { chapter: string; from: number; to: number } | null
  ): Promise<void>;
  setRole(agent: string, role: SessionRole): Promise<number>;
  setGuests(allow: boolean): Promise<number>;
  setSettings(patch: Partial<SessionSettings>): Promise<number>;
  setCoHost(agent: string, on: boolean): Promise<number>;
  handOver(agent: string): Promise<number>;
  voice(on: boolean): Promise<void>;
  signal(to: string, payload: unknown): Promise<void>;
  end(): Promise<void>;
  close(): void;
}

function hostAndBase(): { host: string; basePath?: string } {
  if (/^https?:\/\//.test(A2A_BASE)) return { host: A2A_BASE };
  // A relative base (`/a2a`, the dev proxy): same origin, rooms under `/a2a/agents`.
  return {
    host: location.origin,
    basePath: `${A2A_BASE.replace(/^\//, "")}/agents`,
  };
}

export function openRoom(
  sessionId: string,
  token: string,
  h: RoomHandlers
): Room {
  const { host, basePath } = hostAndBase();
  const client = new AgentClient({
    agent: "reading-session",
    name: sessionId,
    host,
    ...(basePath
      ? { basePath: `${basePath}/reading-session/${sessionId}` }
      : {}),
    query: { token },
    onStateUpdate: (s: SessionState) => h.onState(s),
  } as ConstructorParameters<typeof AgentClient>[0]);
  // The Agents client takes no onOpen/onClose option: the socket's own events say when the room is reached.
  client.addEventListener("open", () => h.onOpen?.());
  client.addEventListener("close", (ev: Event) => {
    const e = ev as CloseEvent;
    h.onClose?.(e.code, e.reason);
  });
  client.addEventListener("message", (ev: MessageEvent) => {
    if (typeof ev.data !== "string" || !ev.data.startsWith('{"t":')) return;
    try {
      h.onFrame(JSON.parse(ev.data) as RoomFrame);
    } catch {
      /* not a frame */
    }
  });
  const call = <T>(m: string, args: unknown[] = []) =>
    client.call(m, args) as Promise<T>;
  return {
    follow: (p) => call<number>("follow", [p]),
    decorate: (d) => call<string>("decorate", [d]),
    undecorate: (id) => call<number>("undecorate", [id]),
    chat: (text) => call<number>("chat", [text]),
    chatPage: (afterSeq = 0) => call<ChatFrame[]>("chatPage", [afterSeq]),
    presence: (verse, view) =>
      call<void>("presence", [{ verse, ...(view ?? {}) }]),
    setRole: (agent, role) => call<number>("setRole", [agent, role]),
    setGuests: (allow) => call<number>("setGuests", [allow]),
    setSettings: (patch) => call<number>("setSettings", [patch]),
    setCoHost: (agent, on) => call<number>("setCoHost", [agent, on]),
    handOver: (agent) => call<number>("handOver", [agent]),
    voice: (on) => call<void>("voice", [on]),
    signal: (to, payload) => call<void>("signal", [to, payload]),
    end: () => call<void>("end"),
    close: () => client.close(),
  };
}
