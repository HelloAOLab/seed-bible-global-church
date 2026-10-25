// LIVE SESSION — ported in outline from packages/seed-bible SessionsManager (docs/porting/SessionsManager.md):
// start a session on the open chapter (the host leads), join one from a share link, follow the leader, see who is
// here and where they are, decorate verses for everyone, chat. The room is state the workspace serves; the record
// is in the host's Library (seed.session.start keeps it).
import { computed, signal } from "@preact/signals";
import type { ReaderBackend } from "../../backend/ReaderBackend";
import {
  openRoom,
  type ChatFrame,
  type Room,
  type SessionPassage,
  type SessionState,
} from "../../backend/room";
import type { Reading } from "../reading/reading";

export interface PresenceView {
  agent: string;
  name: string;
  verse: number | null;
  /** The chapter and verses on their screen. */
  chapter?: string;
  from?: number;
  to?: number;
  at: number;
}

export interface LiveDeps {
  backend: ReaderBackend;
  reading: () => Reading;
  identity: () => { agent: string; name: string } | null;
  openRoom?: typeof openRoom;
}

export function createLiveSession(deps: LiveDeps) {
  const open = deps.openRoom ?? openRoom;
  const sessionId = signal<string | null>(null);
  const code = signal<string | null>(null);
  const state = signal<SessionState | null>(null);
  const connected = signal(false);
  const chat = signal<ChatFrame[]>([]);
  const presence = signal<Record<string, PresenceView>>({});
  /** The chapter and verses on this device's screen (the reader measures it as it scrolls); sent as its presence. */
  const view = signal<{ chapter: string; from: number; to: number } | null>(
    null
  );
  const error = signal<string | null>(null);
  const recordRef = signal<string | null>(null);
  let room: Room | null = null;
  let lastSeenPassage = "";

  /** A guest's identity for this session (`guest:<id>`), when joined without a Home. */
  const guest = signal<{ agent: string; name: string } | null>(null);
  const me = computed(
    () => guest.value?.agent ?? deps.identity()?.agent ?? null
  );
  const voiceFrames = signal<Array<{ from: string; payload: unknown }>>([]);
  let onRtc: ((from: string, payload: unknown) => void) | null = null;
  const myRole = computed(
    () =>
      state.value?.participants.find((p) => p.agent === me.value)?.role ??
      "reader"
  );
  const isLeader = computed(
    () => myRole.value === "leader" || myRole.value === "navigator"
  );
  const isHost = computed(
    () => !!me.value && state.value?.host?.agent === me.value
  );
  const active = computed(() => !!sessionId.value && !state.value?.endedAt);
  /** The session's decorations for the chapter on screen, drawn as broadcast highlights. */
  const decorations = computed(() => {
    const r = deps.reading();
    const chapter = r.chapterRef.value;
    return (state.value?.decorations ?? []).filter(
      (d) => d.chapter === chapter
    );
  });

  const passageOf = (r: Reading): SessionPassage => ({
    translationId: r.translationId.value,
    bookId: r.bookId.value,
    chapterNumber: r.chapterNumber.value,
  });
  const key = (p: SessionPassage) =>
    `${p.translationId}/${p.bookId}/${p.chapterNumber}`;

  function attach(id: string, token: string) {
    room?.close();
    chat.value = [];
    presence.value = {};
    room = open(id, token, {
      onOpen: () => {
        connected.value = true;
        error.value = null;
        void room?.chatPage(0).then((rows) => (chat.value = rows));
      },
      onClose: (c, reason) => {
        connected.value = false;
        if (c === 4404) error.value = "no standing in this session";
        else if (c === 4000) leave();
        else if (reason) error.value = reason;
      },
      onState: (s) => {
        state.value = s;
        // Follow the leader: the room's passage moves this device unless this device leads.
        if (s.passage && !isLeader.value) {
          const k = key(s.passage);
          if (k !== lastSeenPassage) {
            lastSeenPassage = k;
            const r = deps.reading();
            if (key(passageOf(r)) !== k)
              void r.goTo(
                s.passage.translationId,
                s.passage.bookId,
                s.passage.chapterNumber
              );
          }
        }
        if (s.endedAt) leave();
      },
      onFrame: (f) => {
        if (f.t === "chat") chat.value = [...chat.value, f];
        else if (f.t === "rtc") {
          if (f.to === me.value) onRtc?.(f.from, f.payload);
        } else if (f.t === "voice") {
          /* the participant flag arrives with the state; the frame is a nudge */
        } else if (f.t === "presence")
          presence.value = {
            ...presence.value,
            [f.by]: {
              agent: f.by,
              name: f.name,
              verse: f.verse,
              ...(f.chapter && f.from && f.to
                ? { chapter: f.chapter, from: f.from, to: f.to }
                : {}),
              at: f.at,
            },
          };
      },
    });
  }

  async function start() {
    error.value = null;
    const r = deps.reading();
    try {
      const out = await deps.backend.sessionStart(passageOf(r));
      sessionId.value = out.sessionId;
      code.value = out.code ?? null;
      recordRef.value = out.recordRef ?? null;
      lastSeenPassage = key(passageOf(r));
      attach(out.sessionId, out.token);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  async function join(id: string, shareCode?: string) {
    error.value = null;
    try {
      const out = await deps.backend.sessionJoin(id, shareCode);
      guest.value = null;
      sessionId.value = out.sessionId;
      code.value = shareCode ?? null;
      attach(out.sessionId, out.token);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  /** Join without a Home: the share code and a name; the room's guest identity is this device's for the session. */
  async function joinAsGuest(id: string, shareCode: string, name: string) {
    error.value = null;
    try {
      const out = await deps.backend.sessionJoinAsGuest(id, shareCode, name);
      guest.value = { agent: out.agent, name: out.name };
      sessionId.value = out.sessionId;
      code.value = shareCode;
      attach(out.sessionId, out.token);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  /** The leader's own navigation moves the room. */
  function leaderMoved() {
    if (!room || !isLeader.value) return;
    const p = passageOf(deps.reading());
    const k = key(p);
    if (k === lastSeenPassage) return;
    lastSeenPassage = k;
    void room
      .follow(p)
      .catch(
        (e: unknown) =>
          (error.value = e instanceof Error ? e.message : String(e))
      );
  }

  function leave() {
    room?.close();
    room = null;
    guest.value = null;
    sessionId.value = null;
    code.value = null;
    state.value = null;
    connected.value = false;
    presence.value = {};
  }

  const shareLink = computed(() => {
    if (!sessionId.value || !code.value || typeof location === "undefined")
      return null;
    const r = deps.reading();
    return `${location.origin}/read/${r.translationId.value}/${r.bookId.value}/${r.chapterNumber.value}?session=${sessionId.value}&code=${code.value}`;
  });

  return {
    sessionId,
    code,
    state,
    connected,
    chat,
    presence,
    view,
    error,
    recordRef,
    me,
    myRole,
    isLeader,
    isHost,
    active,
    decorations,
    shareLink,
    start,
    join,
    joinAsGuest,
    guest,
    leave,
    /** Voice plumbing: the flag on the room, signalling to one participant, and the frames coming back. */
    setVoice: (on: boolean) => room?.voice(on) ?? Promise.resolve(),
    signal: (to: string, payload: unknown) =>
      room?.signal(to, payload) ?? Promise.resolve(),
    onSignal: (f: ((from: string, payload: unknown) => void) | null) => {
      onRtc = f;
    },
    setGuests: (allow: boolean) => room?.setGuests(allow) ?? Promise.resolve(0),
    voiceFrames,
    leaderMoved,
    say: (text: string) => room?.chat(text) ?? Promise.resolve(0),
    decorate: (start: number, end: number, colorId: string) =>
      room?.decorate({ start, end, colorId }) ?? Promise.resolve(""),
    undecorate: (id: string) => room?.undecorate(id) ?? Promise.resolve(0),
    presenceAt: (
      verse: number | null,
      view?: { chapter: string; from: number; to: number } | null
    ) => room?.presence(verse, view) ?? Promise.resolve(),
    setRole: (
      agent: string,
      role: "leader" | "navigator" | "decorator" | "reader"
    ) => room?.setRole(agent, role) ?? Promise.resolve(0),
    end: async () => {
      await room?.end();
      leave();
    },
  };
}

export type LiveSession = ReturnType<typeof createLiveSession>;
