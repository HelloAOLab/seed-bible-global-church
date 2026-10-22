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
  const error = signal<string | null>(null);
  const recordRef = signal<string | null>(null);
  let room: Room | null = null;
  let lastSeenPassage = "";

  const me = computed(() => deps.identity()?.agent ?? null);
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
        else if (f.t === "presence")
          presence.value = {
            ...presence.value,
            [f.by]: { agent: f.by, name: f.name, verse: f.verse, at: f.at },
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
      sessionId.value = out.sessionId;
      code.value = shareCode ?? null;
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
    leave,
    leaderMoved,
    say: (text: string) => room?.chat(text) ?? Promise.resolve(0),
    decorate: (start: number, end: number, colorId: string) =>
      room?.decorate({ start, end, colorId }) ?? Promise.resolve(""),
    undecorate: (id: string) => room?.undecorate(id) ?? Promise.resolve(0),
    presenceAt: (verse: number | null) =>
      room?.presence(verse) ?? Promise.resolve(),
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
