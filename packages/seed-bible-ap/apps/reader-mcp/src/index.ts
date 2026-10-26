// reader-mcp — the tools side of the hello-world reader triad. One tool, `hello`, reachable two ways:
//   · POST /tools/hello        — the plain HTTP lane reader-a2a calls (service binding in production, URL in dev)
//   · POST /mcp                — the MCP JSON-RPC lane (initialize · tools/list · tools/call) for any MCP client
// It grants nothing and holds no key. The real reader tools (passages, notes, the workspace vault) come later.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { BUCKET_MERGE_TOOL, bucketMerge } from "./tools/bucket-merge";
import type { Collection } from "../../../lib/library-client";

export interface Env {
  /** The `.workspace` agent this MCP serves — a name, shown in every greeting (estate/seed-reader.faithnet.json). */
  WORKSPACE_NAME?: string;
}

const SERVER = { name: "seed-bible-reader-mcp", version: "0.0.1" };
const PROTOCOL_VERSION = "2025-06-18";

const HELLO_TOOL = {
  name: "hello",
  description:
    "Greets a reader by name and names the reader workspace. The hello-world tool; it reads nothing and writes nothing.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Who is saying hello" },
    },
  },
} as const;

export function hello(
  env: Env,
  name: unknown
): { greeting: string; workspace: string } {
  const who =
    typeof name === "string" && name.trim()
      ? name.trim().slice(0, 80)
      : "reader";
  const workspace = env.WORKSPACE_NAME ?? "seed-reader.workspace";
  return {
    greeting: `Hello, ${who}! Welcome to the Seed Bible reader workspace.`,
    workspace,
  };
}

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors());

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: SERVER.name,
    workspace: c.env.WORKSPACE_NAME ?? null,
    tools: [HELLO_TOOL.name, BUCKET_MERGE_TOOL.name],
  })
);

app.post("/tools/hello", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  return c.json({ ok: true, ...hello(c.env, body.name) });
});

app.post("/tools/bucket_merge", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    collection?: Collection;
    chapter?: string;
    current?: unknown;
    incoming?: unknown;
  };
  try {
    if (!body.collection)
      return c.json({ ok: false, error: "collection required" }, 400);
    const out = bucketMerge({
      collection: body.collection,
      chapter: body.chapter,
      current: body.current ?? {},
      incoming: body.incoming ?? {},
    });
    return c.json({ ok: true, ...out });
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      400
    );
  }
});

/** A minimal MCP server over JSON-RPC 2.0 — enough for an MCP client to list and call `hello`. */
type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};
app.post("/mcp", async (c) => {
  const req = (await c.req.json().catch(() => null)) as RpcRequest | null;
  if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "invalid request" },
      },
      400
    );
  }
  const id = req.id ?? null;
  const reply = (result: unknown) => c.json({ jsonrpc: "2.0", id, result });
  const refuse = (code: number, message: string) =>
    c.json({ jsonrpc: "2.0", id, error: { code, message } });
  switch (req.method) {
    case "initialize":
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER,
      });
    case "notifications/initialized":
      return c.body(null, 202);
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: [HELLO_TOOL, BUCKET_MERGE_TOOL] });
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      if (name === BUCKET_MERGE_TOOL.name) {
        try {
          const a = (req.params?.arguments ?? {}) as {
            collection?: Collection;
            chapter?: string;
            current?: unknown;
            incoming?: unknown;
          };
          if (!a.collection) return refuse(-32602, "collection required");
          const out = bucketMerge({
            collection: a.collection,
            chapter: a.chapter,
            current: a.current ?? {},
            incoming: a.incoming ?? {},
          });
          return reply({
            content: [
              {
                type: "text",
                text: `merged: ${out.report.added.length} added, ${out.report.replaced.length} replaced, ${out.report.kept.length} kept, ${out.report.conflicts.length} in conflict`,
              },
            ],
            structuredContent: out,
          });
        } catch (e) {
          return refuse(-32602, e instanceof Error ? e.message : String(e));
        }
      }
      if (name !== HELLO_TOOL.name)
        return refuse(-32602, `unknown tool: ${name}`);
      const args = (req.params?.arguments ?? {}) as { name?: unknown };
      const out = hello(c.env, args.name);
      return reply({
        content: [{ type: "text", text: out.greeting }],
        structuredContent: out,
      });
    }
    default:
      return refuse(-32601, `method not found: ${req.method}`);
  }
});

export default app;
