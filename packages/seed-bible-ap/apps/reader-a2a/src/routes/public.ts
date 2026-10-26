// THE PUBLIC READ LANE — the browser may not reach the estate's public door itself (ADR-0003), so the workspace
// reads a public shelf document for it: one `library.public.read` at the owner's card interface, no credential,
// no task (lib/a2a-client). A lookup, not an act, so a plain route rather than a harness run.
import { Hono } from "hono";
import { edgeEndpointFor, publicShelfRead } from "../../../../lib/a2a-client";

export interface PublicEnv {
  EDGE_URL?: string;
}

export const publicRoutes = new Hono<{ Bindings: PublicEnv }>();

publicRoutes.get("/api/public/read", async (c) => {
  const shelf = c.req.query("shelf") ?? "";
  const path = c.req.query("path") ?? "";
  if (
    !/^[a-z0-9][a-z0-9.-]{1,80}$/i.test(shelf) ||
    !path ||
    path.includes("..")
  )
    return c.json({ ok: false, error: "shelf and path required" }, 400);
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  try {
    const r = await publicShelfRead(
      (input, init) => fetch(input, init),
      edgeEndpointFor(shelf, c.env.EDGE_URL),
      { folder, name }
    );
    if (!r.read)
      return c.json({ ok: false, error: r.refused ?? "not public" }, 404);
    return c.json({
      ok: true,
      owner: r.owner,
      text: r.text ?? "",
      truncated: r.truncated === true,
    });
  } catch (e) {
    return c.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      502
    );
  }
});
