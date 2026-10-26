// THE SERVING-PLANE SMOKE — step 3's "done when": as the seed reader, publish a seed:Offering (a note slice for a
// chapter) to their public shelf through the workspace; the Seed registry (seed-bible.svc) crawls the shelf and indexes
// it by passage; withdrawing it removes it from the index. A live gate against the faithnet Home and the reader's own
// agent; the registry and the workspace may be local or deployed.
//
//   pnpm smoke:svc                       # local a2a :8891 + svc :8892 (`pnpm dev`)
//   A2A_BASE=https://seed-reader-a2a.faithnet.io SVC_BASE=https://seed-bible-a2a.faithnet.io ADMIN_TOKEN=… pnpm smoke:svc
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOME = process.env.HOME_URL ?? "https://www.faithnet.me";
const A2A = (process.env.A2A_BASE ?? "http://127.0.0.1:8891").replace(
  /\/$/,
  ""
);
const SVC = (process.env.SVC_BASE ?? "http://127.0.0.1:8892").replace(
  /\/$/,
  ""
);
const HANDLE = process.env.HANDLE ?? "seedreader";
const PASSAGE = process.env.PASSAGE ?? "JHN.3";
const ADMIN =
  process.env.ADMIN_TOKEN ??
  (() => {
    const p = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../apps/seed-bible-a2a/.dev.vars"
    );
    return existsSync(p)
      ? (/^ADMIN_TOKEN=(.+)$/m.exec(readFileSync(p, "utf8"))?.[1] ?? "")
      : "";
  })();

const j = async (r: Response) => {
  const t = await r.text();
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return { _raw: t.slice(0, 300), _status: r.status };
  }
};
let failures = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) {
    failures++;
    if (detail !== undefined)
      console.log("   ", JSON.stringify(detail).slice(0, 700));
  }
};

const si = await j(
  await fetch(`${HOME}/connect/demo-signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      handle: HANDLE,
      client_id: "seed-bible-reader",
      delegation_template: "ask-as-me",
    }),
  })
);
const token = String(si.id_token ?? "");
check(
  `signed in as ${HANDLE} with an ask-as-me wire`,
  !!token && !!si.delegation,
  si
);
if (!token) process.exit(1);
const conn = await j(
  await fetch(`${A2A}/api/connect`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ delegation: si.delegation }),
  })
);
check("the workspace kept the wire", conn.ok === true, conn);

const ask = async (
  toolId: string,
  args: Record<string, unknown>,
  message: string
) =>
  j(
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
const resultOf = (r: Record<string, unknown>) =>
  ((
    r.reply as
      | { results?: Array<{ result: Record<string, unknown> }> }
      | undefined
  )?.results?.[0]?.result ?? {}) as Record<string, unknown>;
const reindex = async () =>
  j(
    await fetch(`${SVC}/admin/reindex`, {
      method: "POST",
      headers: { "x-admin-token": ADMIN },
    })
  );
const query = async () =>
  j(await fetch(`${SVC}/registry/offerings?passage=${PASSAGE}`));

// 1. publish a note slice for the chapter
const slug = `smoke-${Date.now().toString(36)}`;
const pub = await ask(
  "seed.publish.slice",
  {
    kind: "note",
    passage: PASSAGE,
    title: `Smoke note ${slug}`,
    slug,
    markdown: `# Smoke note\n\nA published slice for ${PASSAGE}, written by the svc smoke at ${new Date().toISOString()}.`,
  },
  `publish my note on ${PASSAGE}`
);
const pr = resultOf(pub);
check(
  "the slice was published: descriptor and rendering saved public and released",
  pub.ok === true &&
    pr.published === true &&
    !!(pr.descriptor as { release?: unknown })?.release,
  pub
);
const descriptorId = String(pr.descriptorId ?? "");

// 2. the registry crawls the shelf and indexes it by passage
const r1 = await reindex();
check("the registry reindexed the shelves", r1.ok === true, r1);
const q1 = await query();
const rows1 =
  (q1.offerings as
    | Array<{ descriptorId: string; shelf: string; kind: string }>
    | undefined) ?? [];
check(
  `the offering is indexed for ${PASSAGE}`,
  rows1.some((o) => o.descriptorId === descriptorId),
  {
    count: q1.count,
    rows: rows1.map((o) => o.descriptorId),
    reindex: r1.shelves,
  }
);

// 3. the workspace's discover tool sees it
const disc = await ask(
  "seed.workspace.discover",
  { passage: `${PASSAGE}.16` },
  `what is there for ${PASSAGE}`
);
const dr = resultOf(disc);
check(
  "seed.workspace.discover answers from the registry (a verse narrows to its chapter)",
  disc.ok === true && Number(dr.count ?? 0) >= 1,
  dr
);

// 3b. the rebuild, while a row exists: wipe the index and re-crawl — the same rows come back (ADR-0004 / ADR-0055)
const snapA = (
  await j(
    await fetch(`${SVC}/admin/snapshot`, {
      headers: { "x-admin-token": ADMIN },
    })
  )
).rows as unknown[];
await j(
  await fetch(`${SVC}/admin/wipe`, {
    method: "POST",
    headers: { "x-admin-token": ADMIN },
  })
);
await reindex();
const snapB = (
  await j(
    await fetch(`${SVC}/admin/snapshot`, {
      headers: { "x-admin-token": ADMIN },
    })
  )
).rows as unknown[];
check(
  `wipe + reindex rebuilds the same ${Array.isArray(snapA) ? snapA.length : "?"} row(s)`,
  Array.isArray(snapA) &&
    snapA.length >= 1 &&
    JSON.stringify(snapA) === JSON.stringify(snapB),
  { before: snapA, after: snapB }
);

// 4. withdraw: private again → the next crawl tombstones it
const wd = await ask(
  "seed.publish.slice",
  { withdraw: { kind: "note", slug } },
  `take my note ${slug} off my shelf`
);
check(
  "the slice was withdrawn (made private)",
  wd.ok === true && resultOf(wd).withdrawn === true,
  wd
);
await reindex();
const q2 = await query();
const rows2 =
  (q2.offerings as Array<{ descriptorId: string }> | undefined) ?? [];
check(
  "un-publishing removed it from the index",
  !rows2.some((o) => o.descriptorId === descriptorId),
  rows2.map((o) => o.descriptorId)
);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
