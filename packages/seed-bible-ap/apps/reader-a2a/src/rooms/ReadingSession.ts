// THE ROOM — one reading session as an Agents SDK `Agent` on reader-a2a's own origin (realtime-collaboration.md,
// hard-problems §7–§8). The synced `state` is the small session document (leader, passage, roles, participants,
// this chapter's decorations, seq); the op log and chat live in the object's SQLite; presence is broadcast raw.
// Admission is what the Worker's join act minted: a ONE-TIME token the device presents on connect, consumed here.
// The room holds serving-plane state only (ADR-0004): the record is the `seed:ReadingSession` the host's agent
// kept in their Library when the session started.
import { Agent, callable, getCurrentAgent, type Connection } from "agents";

import type {
  Decoration,
  SessionPassage,
  SessionRole,
  SessionState,
} from "../../../../lib/seed-protocol/session";
export type {
  Decoration,
  Participant,
  SessionPassage,
  SessionRole,
  SessionState,
} from "../../../../lib/seed-protocol/session";

interface ConnState {
  agent: string;
  name: string;
}

export interface RoomEnv {
  A2A_INTERNAL_MARKER?: string;
}

const INVITE_TTL_MS = 5 * 60_000;
const PRESENCE_MIN_MS = 100;

export class ReadingSession extends Agent<RoomEnv, SessionState> {
  override initialState: SessionState = {
    id: "",
    host: null,
    leader: null,
    passage: null,
    participants: [],
    decorations: [],
    seq: 0,
    startedAt: null,
    endedAt: null,
    recordRef: null,
  };
  private lastPresence = new Map<string, number>();

  override async onStart() {
    this
      .sql`CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, agent TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, exp INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`;
    this
      .sql`CREATE TABLE IF NOT EXISTS ops (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, by TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL)`;
    this
      .sql`CREATE TABLE IF NOT EXISTS chat (seq INTEGER PRIMARY KEY, at TEXT NOT NULL, by TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY)`;
  }

  private isInternal(request: Request): boolean {
    const marker = (
      (this as unknown as { env: RoomEnv }).env.A2A_INTERNAL_MARKER ?? ""
    ).trim();
    return !!marker && request.headers.get("x-ap-internal") === marker;
  }

  // ── The Worker's lane (internal marker): create, invite, snapshot, wipe ──────────────────────────────
  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/reading-session\/[^/]+/, "") || "/";
    if (!this.isInternal(request))
      return Response.json({ ok: false, error: "not found" }, { status: 404 });
    if (request.method === "POST" && path === "/create") {
      const b = (await request.json()) as {
        id: string;
        host: { agent: string; name: string };
        passage: SessionPassage;
        recordRef?: string | null;
        code: string;
      };
      if (this.state.startedAt)
        return Response.json({ ok: true, state: this.state, existed: true });
      this.sql`INSERT OR IGNORE INTO codes (code) VALUES (${b.code})`;
      this.setState({
        ...this.state,
        id: b.id,
        host: b.host,
        leader: b.host.agent,
        passage: b.passage,
        startedAt: new Date().toISOString(),
        recordRef: b.recordRef ?? null,
      });
      this.log("server", "create", { host: b.host.agent, passage: b.passage });
      return Response.json({ ok: true, state: this.state });
    }
    if (request.method === "POST" && path === "/invite") {
      const b = (await request.json()) as {
        agent?: string;
        name: string;
        code?: string;
        /** A guest: no Home, the share code alone; the room mints a guest identity for this session. */
        guest?: boolean;
      };
      if (!this.state.startedAt || this.state.endedAt)
        return Response.json(
          { ok: false, error: "no such session" },
          { status: 404 }
        );
      const codeOk = b.code
        ? this.sql<{
            code: string;
          }>`SELECT code FROM codes WHERE code = ${b.code}`.length > 0
        : false;
      let agent = String(b.agent ?? "").toLowerCase();
      if (b.guest) {
        if (this.state.allowGuests === false)
          return Response.json(
            { ok: false, error: "this session does not take guests" },
            { status: 403 }
          );
        if (!codeOk)
          return Response.json(
            { ok: false, error: "no standing in this session" },
            { status: 404 }
          );
        agent = `guest:${crypto.randomUUID().slice(0, 8)}`;
      }
      const isHost = !b.guest && this.state.host?.agent === agent;
      if (!isHost && !codeOk)
        return Response.json(
          { ok: false, error: "no standing in this session" },
          { status: 404 }
        );
      const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
      const role: SessionRole = isHost ? "leader" : "reader";
      const name =
        String(b.name ?? "")
          .trim()
          .slice(0, 60) || (b.guest ? "Guest" : agent);
      this
        .sql`INSERT INTO invites (token, agent, name, role, exp, used) VALUES (${token}, ${agent}, ${name}, ${role}, ${Date.now() + INVITE_TTL_MS}, 0)`;
      return Response.json({
        ok: true,
        token,
        role,
        agent,
        name,
        ...(b.guest ? { guest: true } : {}),
        expiresInMs: INVITE_TTL_MS,
      });
    }
    // Who this agent is in the session, for its huddle: the host, or someone the session let in (an invite was
    // issued to them under the share code). A guest's identity is minted per invite and never asks.
    if (request.method === "POST" && path === "/standing") {
      const b = (await request.json().catch(() => ({}))) as { agent?: string };
      const agent = String(b.agent ?? "").toLowerCase();
      if (
        !this.state.startedAt ||
        this.state.endedAt ||
        !/^0x[0-9a-f]{40}$/.test(agent)
      )
        return Response.json(
          { ok: false, error: "no such session" },
          { status: 404 }
        );
      if (this.state.host?.agent === agent)
        return Response.json({ ok: true, standing: "host" });
      const invited = this.sql<{
        agent: string;
      }>`SELECT agent FROM invites WHERE agent = ${agent} LIMIT 1`;
      if (!invited.length)
        return Response.json(
          { ok: false, error: "no standing in this session" },
          { status: 404 }
        );
      return Response.json({ ok: true, standing: "reader" });
    }
    if (request.method === "GET" && path === "/snapshot") {
      const ops = this.sql<{
        seq: number;
      }>`SELECT seq FROM ops ORDER BY seq DESC LIMIT 1`;
      return Response.json({
        ok: true,
        state: this.state,
        ops: ops[0]?.seq ?? 0,
      });
    }
    if (request.method === "POST" && path === "/wipe") {
      this.sql`DELETE FROM invites`;
      this.sql`DELETE FROM ops`;
      this.sql`DELETE FROM chat`;
      this.sql`DELETE FROM codes`;
      for (const c of this.getConnections()) c.close(4410, "wiped");
      this.setState({ ...this.initialState });
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  // ── Admission on connect: the one-time token, then the device is a participant ───────────────────
  private invitedBy(
    request: Request
  ): { agent: string; name: string; role: SessionRole } | null {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!token) return null;
    const rows = this.sql<{
      agent: string;
      name: string;
      role: SessionRole;
      exp: number;
      used: number;
    }>`SELECT agent, name, role, exp, used FROM invites WHERE token = ${token}`;
    const r = rows[0];
    if (!r || r.used || r.exp < Date.now()) return null;
    return { agent: r.agent, name: r.name, role: r.role };
  }

  override shouldSendProtocolMessages(
    c: Connection,
    ctx: { request: Request }
  ): boolean {
    const ok = this.invitedBy(ctx.request) !== null;
    if (!ok) c.close(4404, "no standing");
    return ok;
  }

  override async onConnect(
    connection: Connection<ConnState>,
    ctx: { request: Request }
  ) {
    const inv = this.invitedBy(ctx.request);
    if (!inv) {
      connection.close(4404, "no standing");
      return;
    }
    const token = new URL(ctx.request.url).searchParams.get("token") ?? "";
    this.sql`UPDATE invites SET used = 1 WHERE token = ${token}`;
    connection.setState({ agent: inv.agent, name: inv.name });
    const participants = [...this.state.participants];
    const i = participants.findIndex((p) => p.agent === inv.agent);
    if (i >= 0)
      participants[i] = {
        ...participants[i]!,
        connections: participants[i]!.connections + 1,
        name: inv.name,
      };
    else
      participants.push({
        agent: inv.agent,
        name: inv.name,
        role: inv.role,
        connections: 1,
        ...(inv.agent.startsWith("guest:") ? { guest: true } : {}),
      });
    this.setState({ ...this.state, participants });
    this.log(inv.agent, "join", { name: inv.name });
  }

  override async onClose(connection: Connection<ConnState>) {
    const who = connection.state;
    if (!who) return;
    const participants = this.state.participants
      .map((p) =>
        p.agent === who.agent
          ? { ...p, connections: Math.max(0, p.connections - 1) }
          : p
      )
      .filter((p) => p.connections > 0 || p.agent === this.state.host?.agent);
    this.setState({ ...this.state, participants });
    this.log(who.agent, "leave", {});
  }

  // ── Ops ──────────────────────────────────────────────────────────────────────────────────────────
  private actor(connection: Connection<ConnState>): ConnState {
    const who = connection.state;
    if (!who) throw new Error("not admitted");
    return who;
  }
  private roleOf(agent: string): SessionRole {
    return (
      this.state.participants.find((p) => p.agent === agent)?.role ?? "reader"
    );
  }
  private log(by: string, kind: string, body: unknown): number {
    const seq = this.state.seq + 1;
    this
      .sql`INSERT INTO ops (seq, at, by, kind, body) VALUES (${seq}, ${new Date().toISOString()}, ${by}, ${kind}, ${JSON.stringify(body)})`;
    this.setState({ ...this.state, seq });
    return seq;
  }

  /** The leader (or a navigator) moves everyone. */
  @callable()
  follow(passage: SessionPassage) {
    const who = this.actor(this.currentConnection());
    const role = this.roleOf(who.agent);
    if (role !== "leader" && role !== "navigator")
      throw new Error("only the leader navigates");
    const decorations = this.state.decorations.filter(
      (d) => d.chapter === `${passage.bookId}.${passage.chapterNumber}`
    );
    this.setState({ ...this.state, passage, decorations });
    return this.log(who.agent, "follow", passage);
  }

  @callable()
  decorate(d: { start: number; end: number; colorId: string }) {
    const who = this.actor(this.currentConnection());
    const role = this.roleOf(who.agent);
    if (role !== "leader" && role !== "decorator")
      throw new Error("only the leader decorates");
    const p = this.state.passage;
    if (!p) throw new Error("no passage");
    const deco: Decoration = {
      id: crypto.randomUUID(),
      by: who.agent,
      chapter: `${p.bookId}.${p.chapterNumber}`,
      start: d.start,
      end: d.end,
      colorId: d.colorId,
      at: new Date().toISOString(),
    };
    this.setState({
      ...this.state,
      decorations: [...this.state.decorations, deco],
    });
    this.log(who.agent, "decorate", deco);
    return deco.id;
  }

  @callable()
  undecorate(id: string) {
    const who = this.actor(this.currentConnection());
    const role = this.roleOf(who.agent);
    if (role !== "leader" && role !== "decorator")
      throw new Error("only the leader decorates");
    this.setState({
      ...this.state,
      decorations: this.state.decorations.filter((d) => d.id !== id),
    });
    return this.log(who.agent, "undecorate", { id });
  }

  @callable()
  setRole(agent: string, role: SessionRole) {
    const who = this.actor(this.currentConnection());
    if (who.agent !== this.state.host?.agent)
      throw new Error("only the host assigns roles");
    // A guest may navigate or decorate for the room, but never lead it: leading is standing, and a guest has none.
    if (agent.startsWith("guest:") && role === "leader")
      throw new Error("a guest cannot lead the session");
    const participants = this.state.participants.map((p) =>
      p.agent === agent ? { ...p, role } : p
    );
    this.setState({
      ...this.state,
      participants,
      leader: role === "leader" ? agent : this.state.leader,
    });
    return this.log(who.agent, "role", { agent, role });
  }

  /** The host decides whether guests may come in with the share code. */
  @callable()
  setGuests(allow: boolean) {
    const who = this.actor(this.currentConnection());
    if (who.agent !== this.state.host?.agent)
      throw new Error("only the host decides about guests");
    this.setState({ ...this.state, allowGuests: allow !== false });
    return this.log(who.agent, "guests", { allow: allow !== false });
  }

  /** On or off the session's voice: a flag on the participant, so the others know whom to call. */
  @callable()
  voice(on: boolean) {
    const who = this.actor(this.currentConnection());
    const participants = this.state.participants.map((p) =>
      p.agent === who.agent ? { ...p, voice: on === true } : p
    );
    this.setState({ ...this.state, participants });
    this.broadcast(
      JSON.stringify({
        t: "voice",
        by: who.agent,
        name: who.name,
        on: on === true,
      })
    );
  }

  /**
   * WebRTC signalling for the session's voice (peer to peer; the room only relays): an offer, answer or ICE
   * candidate from one participant to another. Never stored, never read by the room, nothing of the audio here.
   */
  @callable()
  signal(to: string, payload: unknown) {
    const who = this.actor(this.currentConnection());
    const frame = JSON.stringify({ t: "rtc", from: who.agent, to, payload });
    for (const c of this.getConnections<ConnState>())
      if (c.state?.agent === to) c.send(frame);
  }

  /** A chat line: kept in the op log (the scope's messaging topic is a later cut), fanned out as a frame. */
  @callable()
  chat(text: string) {
    const who = this.actor(this.currentConnection());
    const t = String(text ?? "")
      .slice(0, 2000)
      .trim();
    if (!t) return 0;
    const seq = this.log(who.agent, "chat", { text: t });
    this
      .sql`INSERT INTO chat (seq, at, by, name, text) VALUES (${seq}, ${new Date().toISOString()}, ${who.agent}, ${who.name}, ${t})`;
    this.broadcast(
      JSON.stringify({
        t: "chat",
        seq,
        at: new Date().toISOString(),
        by: who.agent,
        name: who.name,
        text: t,
      })
    );
    return seq;
  }

  @callable()
  chatPage(afterSeq = 0, max = 100) {
    return this.sql<{
      seq: number;
      at: string;
      by: string;
      name: string;
      text: string;
    }>`SELECT seq, at, by, name, text FROM chat WHERE seq > ${afterSeq} ORDER BY seq ASC LIMIT ${Math.min(Math.max(max, 1), 500)}`;
  }

  @callable()
  opsAfter(afterSeq = 0, max = 200) {
    return this.sql<{
      seq: number;
      at: string;
      by: string;
      kind: string;
      body: string;
    }>`SELECT seq, at, by, kind, body FROM ops WHERE seq > ${afterSeq} ORDER BY seq ASC LIMIT ${Math.min(Math.max(max, 1), 1000)}`;
  }

  /** Where a device is (its selected verse); a raw frame to the others, never state, ≤10 Hz per sender. */
  @callable()
  presence(frame: { verse: number | null }) {
    const who = this.actor(this.currentConnection());
    const now = Date.now();
    if (now - (this.lastPresence.get(who.agent) ?? 0) < PRESENCE_MIN_MS) return;
    this.lastPresence.set(who.agent, now);
    this.broadcast(
      JSON.stringify({
        t: "presence",
        by: who.agent,
        name: who.name,
        verse: frame?.verse ?? null,
        at: now,
      }),
      [this.currentConnection().id]
    );
  }

  @callable()
  end() {
    const who = this.actor(this.currentConnection());
    if (who.agent !== this.state.host?.agent)
      throw new Error("only the host ends the session");
    this.setState({ ...this.state, endedAt: new Date().toISOString() });
    this.log(who.agent, "end", {});
    for (const c of this.getConnections()) c.close(4000, "ended");
  }

  private currentConnection(): Connection<ConnState> {
    const c = getCurrentAgent<ReadingSession>().connection as
      | Connection<ConnState>
      | undefined;
    if (!c) throw new Error("no connection");
    return c;
  }
}
