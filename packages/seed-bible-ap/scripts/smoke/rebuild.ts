// THE REBUILD SMOKE — ADR-0004 / ADR-0055 proven: the Seed registry's rows are a function of the shelves. Snapshot
// the live rows, WIPE the index, reindex from the same shelves, and compare. Anything that does not come back was
// authored in the store, which nothing may be.
//
//   pnpm smoke:rebuild                                   # local svc :8892
//   SVC_BASE=https://seed-bible-a2a.faithnet.io ADMIN_TOKEN=… pnpm smoke:rebuild
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SVC = (process.env.SVC_BASE ?? "http://127.0.0.1:8892").replace(
  /\/$/,
  ""
);
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
const H = { "x-admin-token": ADMIN };

const before = await j(
  await fetch(`${SVC}/admin/reindex`, { method: "POST", headers: H })
);
check("a fresh crawl ran before the wipe", before.ok === true, before);
const snapA = (await j(await fetch(`${SVC}/admin/snapshot`, { headers: H })))
  .rows as unknown[];
const wiped = await j(
  await fetch(`${SVC}/admin/wipe`, { method: "POST", headers: H })
);
check("the index was wiped", wiped.ok === true, wiped);
const empty = await j(await fetch(`${SVC}/admin/snapshot`, { headers: H }));
check(
  "…and holds no rows",
  Array.isArray(empty.rows) && (empty.rows as unknown[]).length === 0,
  empty
);
const after = await j(
  await fetch(`${SVC}/admin/reindex`, { method: "POST", headers: H })
);
check("the shelves were re-crawled", after.ok === true, after);
const snapB = (await j(await fetch(`${SVC}/admin/snapshot`, { headers: H })))
  .rows as unknown[];
check(
  `the rebuilt index equals the one before the wipe (${Array.isArray(snapA) ? snapA.length : "?"} rows)`,
  JSON.stringify(snapA) === JSON.stringify(snapB),
  { before: snapA, after: snapB }
);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
