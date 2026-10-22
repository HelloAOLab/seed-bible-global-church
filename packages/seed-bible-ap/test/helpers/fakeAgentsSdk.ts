// THE AGENTS SDK, FAKED — enough of `agents` for a room (`ReadingSession`) to run under node: `Agent` with
// synced state, a `sql` tagged template over node's built-in SQLite, broadcast to fake connections, and
// `getCurrentAgent()` answering whichever connection a test is speaking as. Wire it with
// `vi.mock("agents", () => import("../../helpers/fakeAgentsSdk"))` and drive a room through `fakeRoom`.
import { DatabaseSync } from "node:sqlite";

export interface FakeConnection<S = unknown> {
  id: string;
  state: S | undefined;
  setState(s: S): void;
  send(msg: string): void;
  close(code?: number, reason?: string): void;
  /** Frames the room sent this connection, in order. */
  sent: string[];
  /** How the room closed it, if it did. */
  closed: { code?: number; reason?: string } | null;
}

let current: { agent: unknown; connection: FakeConnection | undefined } = {
  agent: undefined,
  connection: undefined,
};

export function getCurrentAgent<T>(): { agent: T; connection: unknown } {
  return current as { agent: T; connection: unknown };
}

/** Speak as `connection` for the duration of `fn` — what the SDK does around a callable. */
export function speakingAs<T>(
  agent: unknown,
  connection: FakeConnection | undefined,
  fn: () => T
): T {
  const before = current;
  current = { agent, connection };
  try {
    return fn();
  } finally {
    current = before;
  }
}

export function callable(): (...a: unknown[]) => void {
  return () => undefined;
}

export type Connection<S = unknown> = FakeConnection<S>;

export class Agent<Env = unknown, State = unknown> {
  initialState!: State;
  readonly env: Env;
  private _state: State | undefined;
  private db = new DatabaseSync(":memory:");
  readonly connections: FakeConnection[] = [];

  constructor(env: Env) {
    this.env = env;
  }

  get state(): State {
    return this._state ?? this.initialState;
  }

  setState(s: State): void {
    this._state = s;
  }

  sql<T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): T[] {
    const text = strings.reduce(
      (acc, s, i) => acc + s + (i < values.length ? "?" : ""),
      ""
    );
    const params = values.map((v) =>
      typeof v === "boolean" ? (v ? 1 : 0) : (v as never)
    );
    const stmt = this.db.prepare(text);
    if (/^\s*select/i.test(text)) return stmt.all(...params) as T[];
    stmt.run(...params);
    return [];
  }

  broadcast(msg: string, exclude: string[] = []): void {
    for (const c of this.connections)
      if (!exclude.includes(c.id) && !c.closed) c.sent.push(msg);
  }

  getConnections<S = unknown>(): FakeConnection<S>[] {
    return this.connections.filter((c) => !c.closed) as FakeConnection<S>[];
  }

  /** A new device on the socket (a test's `connect`). */
  addConnection<S>(id: string): FakeConnection<S> {
    const c: FakeConnection<S> = {
      id,
      state: undefined,
      sent: [],
      closed: null,
      setState(s) {
        c.state = s;
      },
      send(msg) {
        c.sent.push(msg);
      },
      close(code, reason) {
        c.closed = { code, reason };
      },
    };
    this.connections.push(c as FakeConnection);
    return c;
  }

  // The lifecycle the room overrides.
  async onStart(): Promise<void> {}
  async onRequest(_request: Request): Promise<Response> {
    return new Response("not found", { status: 404 });
  }
  shouldSendProtocolMessages(
    _c: FakeConnection,
    _ctx: { request: Request }
  ): boolean {
    return true;
  }
  async onConnect(
    _c: FakeConnection,
    _ctx: { request: Request }
  ): Promise<void> {}
  async onClose(_c: FakeConnection): Promise<void> {}
}

export function routeAgentRequest(): Promise<Response | null> {
  return Promise.resolve(null);
}
