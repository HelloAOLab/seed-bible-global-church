// seed-bible-mcp — the serving plane's tools. One today: `offering_validate`, the pure check a shelf document must
// pass before the registry indexes it (shape, owner, passage). HTTP for seed-bible-a2a, MCP JSON-RPC for any client.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Offering } from "../../../lib/seed-schema";
import { chapterOf } from "../../../lib/seed-protocol";

const SERVER = { name: "seed-bible-svc-mcp", version: "0.0.1" };
const VALIDATE = {
  name: "offering_validate",
  description:
    "Checks a seed:Offering descriptor as the Seed registry would: the shape (publishedBy, offeredForPassage, offeringKind), that its publisher is the shelf's owner, and the chapter it indexes under. Pure.",
  inputSchema: {
    type: "object",
    properties: {
      descriptor: { type: "object" },
      owner: { type: "string", description: "the shelf owner's address" },
    },
    required: ["descriptor"],
  },
} as const;

export function validate(descriptor: unknown, owner?: string) {
  const p = Offering.safeParse(descriptor);
  if (!p.success)
    return {
      ok: false as const,
      problems: p.error.issues.map(
        (i) => `${i.path.join(".") || "descriptor"}: ${i.message}`
      ),
    };
  const o = p.data;
  const same = (a: string, b: string) =>
    a.replace(/^eip155:\d+:/, "").toLowerCase() ===
    b.replace(/^eip155:\d+:/, "").toLowerCase();
  if (owner && !same(o.publishedBy, owner))
    return {
      ok: false as const,
      problems: [
        `publishedBy ${o.publishedBy} is not the shelf's owner ${owner}`,
      ],
    };
  return {
    ok: true as const,
    passage: o.offeredForPassage ? chapterOf(o.offeredForPassage) : "*",
    passageRef: o.offeredForPassage ?? "*",
    kind: o.offeringKind,
    title: o.label,
    id: o["@id"],
  };
}

const app = new Hono();
app.use("*", cors());
app.get("/health", (c) =>
  c.json({ ok: true, service: SERVER.name, tools: [VALIDATE.name] })
);
app.post("/tools/offering_validate", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as {
    descriptor?: unknown;
    owner?: string;
  };
  return c.json(validate(b.descriptor, b.owner));
});
type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};
app.post("/mcp", async (c) => {
  const req = (await c.req.json().catch(() => null)) as RpcRequest | null;
  if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string")
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "invalid request" },
      },
      400
    );
  const id = req.id ?? null;
  const reply = (result: unknown) => c.json({ jsonrpc: "2.0", id, result });
  switch (req.method) {
    case "initialize":
      return reply({
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: SERVER,
      });
    case "notifications/initialized":
      return c.body(null, 202);
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: [VALIDATE] });
    case "tools/call": {
      if (String(req.params?.name) !== VALIDATE.name)
        return c.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: `unknown tool: ${String(req.params?.name)}`,
          },
        });
      const a = (req.params?.arguments ?? {}) as {
        descriptor?: unknown;
        owner?: string;
      };
      const out = validate(a.descriptor, a.owner);
      return reply({
        content: [
          {
            type: "text",
            text: out.ok
              ? `valid: ${out.title} for ${out.passage}`
              : `invalid: ${out.problems.join("; ")}`,
          },
        ],
        structuredContent: out,
        isError: !out.ok,
      });
    }
    default:
      return c.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `method not found: ${req.method}` },
      });
  }
});
export default app;
