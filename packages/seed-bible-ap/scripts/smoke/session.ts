// THE LIVE-SESSION SMOKE — step 6's "done when": two devices, one leader. The host starts a session on John 3 (the
// record goes to their Library), a second device joins with the share code; follow, a decoration and a chat line
// round-trip under 500 ms; a late joiner gets the snapshot; a stranger gets 404; the room wiped, the record is
// still in the host's Library. Runs against reader-a2a (local `pnpm dev` or faithnet) with the Home's demo reader.
//
//   pnpm smoke:session
//   A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:session
import { AgentClient } from "agents/client";
import { listQuickConnect } from "@agenticprimitives/connect-client";

const HOME = process.env.HOME_URL ?? "https://www.faithnet.me";
const A2A = (process.env.A2A_BASE ?? "http://127.0.0.1:8891").replace(
  /\/$/,
  ""
);
const HANDLE = process.env.HANDLE ?? "seedreader";
let GUEST = process.env.GUEST_HANDLE ?? "";

let failures = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) {
    failures++;
    if (detail !== undefined)
      console.log("   ", JSON.stringify(detail).slice(0, 600));
  }
};
const j = async (r: Response) =>
  (await r.json().catch(() => ({}))) as Record<string, unknown>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!f() && Date.now() - t0 < ms) await sleep(20);
  return f();
};

async function signIn(handle: string) {
  const si = await j(
    await fetch(`${HOME}/connect/demo-signin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle,
        client_id: "seed-bible-reader",
        delegation_template: "ask-as-me",
      }),
    })
  );
  const token = String(si.id_token ?? "");
  if (!token)
    throw new Error(
      `no id_token for ${handle}: ${JSON.stringify(si).slice(0, 200)}`
    );
  await fetch(`${A2A}/api/connect`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ delegation: si.delegation }),
  });
  const ask = async (
    toolId: string,
    args: Record<string, unknown>,
    message: string
  ) => {
    const out = await j(
      await fetch(`${A2A}/harness/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session: token,
          message,
          plan: { steps: [{ id: "s1", toolId, args }] },
        }),
      })
    );
    const reply = out.reply as
      | {
          kind: string;
          error?: string;
          results?: Array<{ result: Record<string, unknown> }>;
        }
      | undefined;
    if (!out.ok || reply?.kind !== "answer")
      throw new Error(String(reply?.error ?? out.error ?? "refused"));
    return reply.results?.[0]?.result ?? {};
  };
  return { token, ask };
}

interface State {
  passage: {
    translationId: string;
    bookId: string;
    chapterNumber: number;
  } | null;
  participants: Array<{ agent: string; name: string; role: string }>;
  decorations: Array<{
    id: string;
    start: number;
    end: number;
    colorId: string;
  }>;
  seq: number;
  endedAt: string | null;
}

function device(sessionId: string, token: string) {
  const states: State[] = [];
  const frames: Array<Record<string, unknown>> = [];
  const client = new AgentClient({
    agent: "reading-session",
    name: sessionId,
    host: A2A,
    query: { token },
    onStateUpdate: (s: State) => states.push(s),
  } as ConstructorParameters<typeof AgentClient>[0]);
  client.addEventListener("message", (ev: MessageEvent) => {
    if (typeof ev.data === "string" && ev.data.startsWith('{"t":'))
      frames.push(JSON.parse(ev.data));
  });
  const closed: number[] = [];
  client.addEventListener("close", (ev: CloseEvent) => closed.push(ev.code));
  return {
    client,
    states,
    frames,
    closed,
    latest: () => states[states.length - 1],
    call: <T>(m: string, args: unknown[] = []) =>
      client.call(m, args) as Promise<T>,
  };
}

if (!GUEST) {
  // Another of the Home's sample people as the guest, so a wrong share code is really a stranger's.
  const people = await listQuickConnect({
    homeOrigin: HOME,
    clientId: "seed-bible-reader",
  }).catch(() => [] as Array<{ handle: string }>);
  GUEST = people.find((p) => p.handle !== HANDLE)?.handle ?? "";
}
const host = await signIn(HANDLE);
check(`signed in as ${HANDLE}`, !!host.token);

// 1. the host starts a session on John 3; the record goes to the host's Library
const started = (await host.ask(
  "seed.session.start",
  { translationId: "BSB", bookId: "JHN", chapterNumber: 3 },
  "read John 3 together"
)) as {
  sessionId: string;
  code: string;
  token: string;
  recordRef: string | null;
  recordNote?: string;
};
check(
  "the session started with a share code and a one-time token",
  !!started.sessionId && !!started.code && !!started.token,
  started
);
check(
  "the host's agent kept the seed:ReadingSession record",
  !!started.recordRef,
  started
);

// 2. the host's device connects and leads
const a = device(started.sessionId, started.token);
check(
  "the host's device got the snapshot",
  await until(() => a.states.length > 0),
  a.closed
);
check(
  "…with the passage and the host as leader",
  await until(
    () =>
      a.latest()?.passage?.bookId === "JHN" &&
      !!a.latest()?.participants.some((p) => p.role === "leader")
  ),
  a.latest()
);

// 3. a second device joins with the share code (the guest, or the same person on another machine)
const guest = GUEST ? await signIn(GUEST) : host;
const joined = (await guest.ask(
  "seed.session.join",
  { sessionId: started.sessionId, code: started.code },
  "join"
)) as { token: string; role: string };
check("a second device joined with the share code", !!joined.token, joined);
const b = device(started.sessionId, joined.token);
check(
  "the late joiner got the snapshot",
  await until(() => b.states.length > 0 && !!b.latest()?.passage),
  b.closed
);

// 3b. a guest — no Home — joins with the share code and a name, as a reader
const guestJoin = (await (
  await fetch(`${A2A}/api/session/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: started.sessionId,
      code: started.code,
      name: "Visitor",
    }),
  })
).json()) as {
  ok?: boolean;
  token?: string;
  agent?: string;
  role?: string;
  error?: string;
};
check(
  "a guest joined with the share code alone",
  guestJoin.ok === true &&
    !!guestJoin.token &&
    /^guest:/.test(guestJoin.agent ?? ""),
  guestJoin
);
const g = device(started.sessionId, guestJoin.token ?? "");
check(
  "the roster lists the guest as a reader",
  await until(
    () =>
      !!g
        .latest()
        ?.participants.some(
          (p) => p.agent === guestJoin.agent && p.role === "reader"
        )
  ),
  g.latest()?.participants
);
const guestNoCode = (await (
  await fetch(`${A2A}/api/session/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: started.sessionId,
      code: "NOPE",
      name: "Stranger",
    }),
  })
).json()) as { ok?: boolean };
check(
  "a guest with a wrong code is refused",
  guestNoCode.ok !== true,
  guestNoCode
);
g.client.close();

// 4. follow: the leader moves, the other device sees it, under 500 ms
let t0 = Date.now();
await a.call("follow", [
  { translationId: "BSB", bookId: "JHN", chapterNumber: 4 },
]);
const followed = await until(
  () => b.latest()?.passage?.chapterNumber === 4,
  2000
);
const followMs = Date.now() - t0;
check(
  `follow reached the other device in ${followMs} ms`,
  !!followed && followMs < 500,
  b.latest()
);

// 5. a decoration
t0 = Date.now();
const decoId = await a.call<string>("decorate", [
  { start: 16, end: 16, colorId: "yellow" },
]);
const decorated = await until(
  () => !!b.latest()?.decorations.some((d) => d.id === decoId),
  2000
);
check(
  `the decoration reached the other device in ${Date.now() - t0} ms`,
  !!decorated && Date.now() - t0 < 500
);

// 6. chat round-trip
t0 = Date.now();
await b.call("chat", ["hello from the second device"]);
const chatted = await until(
  () =>
    a.frames.some(
      (f) => f.t === "chat" && f.text === "hello from the second device"
    ),
  2000
);
check(
  `chat round-tripped in ${Date.now() - t0} ms`,
  !!chatted && Date.now() - t0 < 500,
  a.frames
);

// 7. a stranger: no token → closed 4404; wrong code → 404 from the join act
const stranger = device(started.sessionId, "not-a-token");
await until(() => stranger.closed.length > 0, 3000);
check(
  "a stranger's socket gets no snapshot and is closed",
  stranger.states.length === 0 && stranger.client.readyState !== WebSocket.OPEN,
  {
    closed: stranger.closed,
    states: stranger.states.length,
    readyState: stranger.client.readyState,
  }
);
stranger.client.close();
let joinRefused = false;
try {
  await guest.ask(
    "seed.session.join",
    { sessionId: started.sessionId, code: "WRONG1" },
    "join"
  );
} catch (e) {
  joinRefused = !!/standing|404/.test(
    e instanceof Error ? e.message : String(e)
  );
}
check(
  GUEST
    ? "a wrong share code is refused by the join act"
    : "a wrong share code is refused by the join act (skipped: no guest person; the host needs no code)",
  GUEST ? joinRefused : true
);

// 8. the record survives the room: wipe the DO, read the record back through the host's agent
const marker = process.env.A2A_INTERNAL_MARKER ?? "";
if (marker) {
  const w = await j(
    await fetch(`${A2A}/agents/reading-session/${started.sessionId}/wipe`, {
      method: "POST",
      headers: { "x-ap-internal": marker, "content-type": "application/json" },
    })
  );
  check("the room was wiped", w.ok === true, w);
} else
  console.log(
    "· (A2A_INTERNAL_MARKER unset: the wipe step is skipped; the record check still runs)"
  );
const rec = (await host.ask(
  "seed.session.record",
  { sessionId: started.sessionId },
  "my session record"
)) as { record?: Record<string, unknown> };
check(
  "the seed:ReadingSession record is still in the host's Library",
  rec.record?.["@type"] === "seed:ReadingSession",
  rec
);

a.client.close();
b.client.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
