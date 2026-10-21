// In-process triad smoke (run: pnpm smoke). Routes reader-a2a's fetch() to the reader-mcp Hono app and answers the
// run object in memory, proving stranger hello → MCP, and a seed reader's `/harness/ask` as ONE harness run,
// without booting servers. Pattern: verifiable-content-demo `apps/demo-bible-a2a/smoke.ts`.
import a2a from "../apps/reader-a2a/src/index";
import mcp from "../apps/reader-mcp/src/index";
import { runStorage, memoryRunKv } from "@agenticprimitives/service-host";
import { handleRunStoreRequest } from "@agenticprimitives/service-host/cloudflare";

const MCP_BASE = "http://127.0.0.1:8890";
const mcpEnv = { WORKSPACE_NAME: "seed-reader.workspace" };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.startsWith(MCP_BASE))
    return mcp.request(url.slice(MCP_BASE.length), init, mcpEnv);
  return realFetch(input, init);
}) as typeof fetch;

// The agent's run object, in memory: the same store the Worker binds as `RUNS`.
const runObjects = new Map<string, ReturnType<typeof runStorage>>();
const RUNS = {
  idFromName: (name: string) => name,
  get: (id: string) => ({
    fetch: async (req: Request) => {
      let store = runObjects.get(id);
      if (!store) {
        store = runStorage(memoryRunKv());
        runObjects.set(id, store);
      }
      return (
        (await handleRunStoreRequest(req, store)) ??
        new Response("no such op", { status: 404 })
      );
    },
  }),
} as unknown as DurableObjectNamespace;

const SEED = {
  handle: "seedreader",
  sa: "0x00000000000000000000000000000000000000aa",
  name: "Seed Reader",
};
const env = {
  MCP_URL: MCP_BASE,
  RUNS,
  DEV_STUB_SESSIONS: "1",
  DEV_READERS: JSON.stringify({
    [SEED.handle]: { sa: SEED.sa, name: SEED.name },
  }),
  A2A_INTERNAL_MARKER: "smoke",
};
const post = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) =>
  a2a.request(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    env
  );

let failures = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) {
    failures++;
    if (detail !== undefined)
      console.log("   ", JSON.stringify(detail).slice(0, 400));
  }
};

{
  const r = (await (
    await mcp.request(
      "/mcp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
      mcpEnv
    )
  ).json()) as { result?: { tools?: Array<{ name: string }> } };
  check(
    "reader-mcp lists the hello tool over MCP JSON-RPC",
    r.result?.tools?.[0]?.name === "hello",
    r
  );
  const call = (await (
    await mcp.request(
      "/mcp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "hello", arguments: { name: "Ruth" } },
        }),
      },
      mcpEnv
    )
  ).json()) as { result?: { content?: Array<{ text: string }> } };
  check(
    "reader-mcp tools/call hello greets by name",
    call.result?.content?.[0]?.text?.includes("Hello, Ruth!") === true,
    call
  );
}
{
  const card = (await (
    await a2a.request("/.well-known/agent-card.json", {}, env)
  ).json()) as { skills?: Array<{ id: string }> };
  check(
    "reader-a2a card advertises hello-reader",
    card.skills?.[0]?.id === "hello-reader",
    card
  );
}
{
  const r = (await (await post("/hello", {})).json()) as {
    ok: boolean;
    greeting?: string;
    reader?: unknown;
  };
  check(
    "stranger /hello reaches the MCP through the agent",
    r.ok && !!r.greeting?.includes("Hello, reader!") && r.reader === null,
    r
  );
}
{
  const r = (await (
    await post("/hello", { id_token: `dev:${SEED.handle}` })
  ).json()) as { ok: boolean; greeting?: string; reader?: { agent?: string } };
  check(
    "seed reader /hello greets them by name",
    r.ok &&
      !!r.greeting?.includes(`Hello, ${SEED.name}!`) &&
      r.reader?.agent === SEED.sa,
    r
  );
}
{
  const r = (await (
    await a2a.request(
      "/me",
      { headers: { authorization: `Bearer dev:${SEED.handle}` } },
      env
    )
  ).json()) as { ok: boolean; reader?: { agent?: string; via?: string } };
  check(
    "/me names the seed reader from the dev session",
    r.ok && r.reader?.agent === SEED.sa && r.reader?.via === "dev-stub",
    r
  );
  const nobody = await a2a.request(
    "/me",
    { headers: { authorization: "Bearer dev:nobody" } },
    env
  );
  check("/me refuses an unknown dev handle", nobody.status === 401);
}
{
  const r = (await (
    await post("/harness/ask", {
      session: `dev:${SEED.handle}`,
      message: "hello",
    })
  ).json()) as {
    ok: boolean;
    runRef?: string;
    reply?: {
      kind: string;
      text?: string;
      results?: Array<{ result: { greeting?: string } }>;
    };
  };
  check(
    "seed reader /harness/ask is one harness run that says hello",
    r.ok && r.reply?.kind === "answer" && !!r.runRef,
    r
  );
  check(
    "…and the run's result carries the greeting by name",
    r.reply?.results?.[0]?.result?.greeting?.includes(SEED.name) === true,
    r.reply
  );
}
{
  const r = (await (
    await post("/harness/ask", { session: "dev:stranger", message: "hello" })
  ).json()) as { ok: boolean; error?: string };
  check("/harness/ask with a bad session is refused", r.ok === false, r);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
