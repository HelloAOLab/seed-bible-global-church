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
import {
  canDecorate,
  canNavigate,
  isHostish,
  settingsOf,
  type SessionSettings,
} from "@seed/seed-protocol/session";

/** A verse someone tapped, flaring on everyone's screen for a moment (the old reader's selection effect). */
export interface VerseFlare {
  id: string;
  agent: string;
  chapter: string;
  verse: number;
}

const FLARE_MS = 1200;
/** How long "typing…" shows without a fresh keystroke from that person. */
const TYPING_MS = 6000;

/** A line in the chat that nobody typed: someone joined. */
export interface ChatEvent {
  kind: "join";
  key: string;
  names: string[];
  at: string;
}

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
  /** Whether this device moves the passage for everyone (the host, a co-host, Navigate, or everyone when the host allows). */
  const isLeader = computed(
    () => !!state.value && canNavigate(state.value, me.value)
  );
  const canHighlight = computed(
    () => !!state.value && canDecorate(state.value, me.value)
  );
  const isHost = computed(
    () => !!me.value && state.value?.host?.agent === me.value
  );
  /** The host, a co-host or the leader: changes the settings. */
  const isHostLike = computed(
    () => !!state.value && isHostish(state.value, me.value)
  );
  const settings = computed(() => settingsOf(state.value));
  /** Ticks while someone else's highlight is waiting to fade, so it goes on time. */
  const clock = signal(Date.now());
  let ticker: ReturnType<typeof setInterval> | null = null;
  const flares = signal<VerseFlare[]>([]);
  /** Who is typing in the chat now (by agent: name and until when). */
  const typing = signal<Record<string, { name: string; until: number }>>({});
  const chatEvents = signal<ChatEvent[]>([]);
  /** Lines from others that came while the chat was not on screen. */
  const unread = signal<ChatFrame[]>([]);
  /** Whether the session's chat is on screen (the chat panel sets it); while it is, nothing is unread. */
  const chatOnScreen = signal(false);
  let knownPeople: Set<string> | null = null;
  const lastVerse = new Map<string, number | null>();
  const active = computed(() => !!sessionId.value && !state.value?.endedAt);
  /** The session's decorations for the chapter on screen, drawn as broadcast highlights. */
  const decorations = computed(() => {
    const r = deps.reading();
    const chapter = r.chapterRef.value;
    const seconds = settings.value.highlightSeconds;
    const now = clock.value;
    return (state.value?.decorations ?? []).filter(
      (d) =>
        d.chapter === chapter &&
        (seconds === null ||
          d.by === me.value ||
          now - Date.parse(d.at) < seconds * 1000)
    );
  });

  const passageOf = (r: Reading): SessionPassage => ({
    translationId: r.translationId.value,
    bookId: r.bookId.value,
    chapterNumber: r.chapterNumber.value,
  });
  // With the translation shared it is part of where everyone is; otherwise each keeps their own.
  const key = (p: SessionPassage) =>
    settings.value.shareTranslation
      ? `${p.translationId}/${p.bookId}/${p.chapterNumber}`
      : `${p.bookId}/${p.chapterNumber}`;

  function attach(id: string, token: string) {
    room?.close();
    chat.value = [];
    presence.value = {};
    typing.value = {};
    chatEvents.value = [];
    unread.value = [];
    knownPeople = null;
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
        noteJoins(s);
        // The room's passage moved (by whoever may move it): this device goes there too, in the shared translation
        // or its own. Its own move set lastSeenPassage first, so it does not bounce back.
        if (s.passage) {
          const k = key(s.passage);
          if (k !== lastSeenPassage) {
            lastSeenPassage = k;
            const r = deps.reading();
            if (key(passageOf(r)) !== k)
              void r.goTo(
                settings.value.shareTranslation
                  ? s.passage.translationId
                  : r.translationId.value,
                s.passage.bookId,
                s.passage.chapterNumber
              );
          }
        }
        const timed =
          settingsOf(s).highlightSeconds !== null &&
          s.decorations.some((d) => d.by !== me.value);
        if (timed && !ticker)
          ticker = setInterval(() => (clock.value = Date.now()), 1000);
        else if (!timed && ticker) {
          clearInterval(ticker);
          ticker = null;
        }
        if (s.endedAt) leave();
      },
      onFrame: (f) => {
        if (f.t === "chat") {
          chat.value = [...chat.value, f];
          if (f.by !== me.value) {
            const { [f.by]: _done, ...rest } = typing.value;
            typing.value = rest;
            if (!chatOnScreen.value) unread.value = [...unread.value, f];
          }
        } else if (f.t === "typing") {
          if (f.by === me.value) return;
          const { [f.by]: _was, ...rest } = typing.value;
          typing.value = f.on
            ? {
                ...rest,
                [f.by]: { name: f.name, until: Date.now() + TYPING_MS },
              }
            : rest;
          if (f.on)
            setTimeout(() => {
              const cur = typing.value[f.by];
              if (cur && cur.until <= Date.now()) {
                const { [f.by]: _gone, ...left } = typing.value;
                typing.value = left;
              }
            }, TYPING_MS + 50);
        } else if (f.t === "rtc") {
          if (f.to === me.value) onRtc?.(f.from, f.payload);
        } else if (f.t === "voice") {
          /* the participant flag arrives with the state; the frame is a nudge */
        } else if (f.t === "presence") {
          flareFrom(f.by, f.verse, f.chapter);
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
        }
      },
    });
  }

  /** "X joined" in the chat for each person who came after this device did. */
  function noteJoins(s: SessionState) {
    const here = new Set(
      s.participants.filter((p) => p.connections > 0).map((p) => p.agent)
    );
    if (knownPeople) {
      const came = s.participants.filter(
        (p) =>
          here.has(p.agent) &&
          !knownPeople!.has(p.agent) &&
          p.agent !== me.value
      );
      if (came.length)
        chatEvents.value = [
          ...chatEvents.value,
          {
            kind: "join",
            key: `join:${s.seq}`,
            names: came.map((p) => p.name),
            at: new Date().toISOString(),
          },
        ];
    }
    knownPeople = here;
  }

  /** Whether a line names this person (@Name) or everyone (@everyone). */
  function mentionsMe(text: string): boolean {
    const name = (guest.value?.name ?? deps.identity()?.name ?? "").trim();
    const lower = text.toLowerCase();
    return (
      /(^|\s)@everyone\b/.test(lower) ||
      (!!name && lower.includes(`@${name.toLowerCase()}`))
    );
  }
  const mentioned = computed(() =>
    unread.value.some((f) => mentionsMe(f.text))
  );

  /** A newly tapped verse flares, when the settings say whose taps do. */
  function flareFrom(agent: string, verse: number | null, chapter?: string) {
    const before = lastVerse.get(agent);
    lastVerse.set(agent, verse);
    const s = state.value;
    if (!s || verse === null || verse === before) return;
    const who = settings.value.selectionEffects;
    if (who === "none" || (who === "hosts-only" && !isHostish(s, agent)))
      return;
    const at =
      chapter ??
      (s.passage ? `${s.passage.bookId}.${s.passage.chapterNumber}` : null);
    if (!at) return;
    const flare = { id: `${agent}:${Date.now()}`, agent, chapter: at, verse };
    flares.value = [...flares.value.filter((x) => x.agent !== agent), flare];
    setTimeout(
      () => (flares.value = flares.value.filter((x) => x.id !== flare.id)),
      FLARE_MS
    );
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
    if (ticker) clearInterval(ticker);
    ticker = null;
    typing.value = {};
    chatEvents.value = [];
    unread.value = [];
    knownPeople = null;
    flares.value = [];
    lastVerse.clear();
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
    canHighlight,
    isHost,
    isHostLike,
    settings,
    flares,
    typing,
    chatEvents,
    unread,
    mentioned,
    mentionsMe,
    chatOnScreen,
    /** The chat is on screen: what came is read. */
    markRead: () => (unread.value = []),
    setTyping: (on: boolean) =>
      room?.typing(on).catch(() => {}) ?? Promise.resolve(),
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
    ) =>
      // Presence is best effort: a frame lost while the line drops is replaced by the next.
      room?.presence(verse, view).catch(() => {}) ?? Promise.resolve(),
    setRole: (
      agent: string,
      role: "leader" | "navigator" | "decorator" | "reader"
    ) => room?.setRole(agent, role) ?? Promise.resolve(0),
    setSettings: (patch: Partial<SessionSettings>) =>
      room?.setSettings(patch) ?? Promise.resolve(0),
    setCoHost: (agent: string, on: boolean) =>
      room?.setCoHost(agent, on) ?? Promise.resolve(0),
    /** The host leaves the session to someone else, who becomes its host. */
    handOver: async (agent: string) => {
      await room?.handOver(agent);
      leave();
    },
    end: async () => {
      // The room closes every line as it ends, which can beat its answer to this call: either way it ended.
      await room?.end().catch(() => {});
      leave();
    },
  };
}

export type LiveSession = ReturnType<typeof createLiveSession>;
