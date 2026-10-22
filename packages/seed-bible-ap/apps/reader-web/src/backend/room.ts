// THE ROOM CLIENT — a device's WebSocket to a reading session on reader-a2a's origin (Agents SDK client). The
// one-time token from the join act goes on the connect request and is spent there; the session document arrives
// as state updates, chat and presence as raw frames. Dev: through Vite's `/a2a` proxy (ws: true).
import { AgentClient } from "agents/client";
import { A2A_BASE } from "../api";
import type {
  SessionPassage,
  SessionRole,
  SessionState,
} from "@seed/seed-protocol/session";

export type { SessionState, SessionPassage, SessionRole };

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
  at: number;
}
export type RoomFrame = ChatFrame | PresenceFrame;

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
  presence(verse: number | null): Promise<void>;
  setRole(agent: string, role: SessionRole): Promise<number>;
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
    onOpen: () => h.onOpen?.(),
    onClose: (e: { code: number; reason: string }) =>
      h.onClose?.(e.code, e.reason),
  } as ConstructorParameters<typeof AgentClient>[0]);
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
    presence: (verse) => call<void>("presence", [{ verse }]),
    setRole: (agent, role) => call<number>("setRole", [agent, role]),
    end: () => call<void>("end"),
    close: () => client.close(),
  };
}
