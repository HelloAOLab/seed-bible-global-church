// THE VAULT SMOKE — step 2's "done when" (implementation-guide §3): as the seed reader, put a highlight in John 3,
// read the bucket back from THEIR Library, re-put with the same opId and see no new version. A live gate: it signs
// in at the faithnet Home (quick connect, ask-as-me), hands the wire to reader-a2a, and asks the reader's agent
// through the workspace. Needs the Home's demo roster to carry the reader and the workspace's asking key to be the
// registered one.
//
//   pnpm smoke:vault                                        # against the local a2a (:8891 — `pnpm dev` first)
//   A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:vault
import { chapterOf } from "../../lib/seed-protocol";

const HOME = process.env.HOME_URL ?? "https://www.faithnet.me";
const A2A = (process.env.A2A_BASE ?? "http://127.0.0.1:8891").replace(
  /\/$/,
  ""
);
const HANDLE = process.env.HANDLE ?? "seedreader";
const CLIENT_ID = "seed-bible-reader";
const PASSAGE = process.env.PASSAGE ?? "JHN.3.16";

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
      console.log("   ", JSON.stringify(detail).slice(0, 600));
  }
};

// 1. sign in as the seed reader with the ask-as-me wire
const si = await j(
  await fetch(`${HOME}/connect/demo-signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      handle: HANDLE,
      client_id: CLIENT_ID,
      delegation_template: "ask-as-me",
    }),
  })
);
const token = String(si.id_token ?? "");
const reader = String(si.sub ?? "")
  .replace(/^eip155:\d+:/, "")
  .toLowerCase();
check(
  `signed in as ${HANDLE} with an ask-as-me wire`,
  !!token && !!si.delegation && /^0x[0-9a-f]{40}$/.test(reader),
  si
);
if (!token) process.exit(1);

// 2. hand the wire to the workspace
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
check(
  "the workspace kept the wire",
  conn.ok === true && conn.wire === true,
  conn
);

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
      | { results?: Array<{ toolId: string; result: Record<string, unknown> }> }
      | undefined
  )?.results?.[0]?.result ?? {}) as Record<string, unknown>;

// 3. put a highlight in John 3 (a fresh opId every run)
const opId = `smoke-${Date.now().toString(36)}`;
const item = {
  "@id": `hl-${opId}`,
  "@type": "seed:Highlight",
  heldBy: reader,
  aboutPassage: PASSAGE,
  ofEdition: "BSB",
  highlightColor: "seed:highlightcolor-yellow",
  opId,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const put1 = await ask(
  "seed.highlight.put",
  { item },
  `highlight ${PASSAGE} in yellow`
);
const r1 = resultOf(put1);
check(
  "the put landed as a run on the workspace",
  put1.ok === true && (put1.reply as { kind?: string })?.kind === "answer",
  put1
);
check(
  "…and the reader's agent saved the bucket (changed, a file version)",
  r1.changed === true && !!(r1.file as { version?: number } | null)?.version,
  r1
);
const v1 = Number((r1.file as { version?: number } | null)?.version ?? 0);

// 4. read the bucket back from the Library
const read = await ask(
  "seed.bucket.read",
  { collection: "highlights", chapter: chapterOf(PASSAGE) },
  `what did I highlight in ${chapterOf(PASSAGE)}`
);
const rb = resultOf(read);
const graph =
  (
    rb.bucket as
      | { "@graph"?: Array<{ "@id": string; opId: string }> }
      | undefined
  )?.["@graph"] ?? [];
check(
  "the bucket read back from the Library holds the highlight",
  graph.some((it) => it["@id"] === item["@id"] && it.opId === opId),
  { count: graph.length, file: rb.file }
);
check(
  "…at the version the put reported",
  Number((rb.file as { version?: number } | null)?.version ?? -1) === v1,
  { read: rb.file, put: r1.file }
);

// 5. re-put with the same opId: nothing changes, no new version
const put2 = await ask(
  "seed.highlight.put",
  { item },
  `highlight ${PASSAGE} in yellow (again)`
);
const r2 = resultOf(put2);
check("a re-put with the same opId is unchanged", r2.changed === false, r2);
check(
  "…and the Library's version did not move",
  Number((r2.file as { version?: number } | null)?.version ?? -1) === v1,
  { before: v1, after: r2.file }
);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
