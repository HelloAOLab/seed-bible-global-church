// THE READER-WEB SMOKE — step 4's live gate for the UI's own backend seam: the a2a backend (apps/reader-web/src/
// backend/a2a.ts), the device stores and the outbox, driven exactly as the page drives them, against reader-a2a and
// the reader's Home. A highlight and a note made "offline" flush as one run per bucket; a second device sees them.
//
//   A2A_BASE=https://seed-reader-a2a.faithnet.io pnpm smoke:reader-web      # or the local a2a on :8891
import { createA2aBackend } from "../../apps/reader-web/src/backend/a2a";
import { memoryStores } from "../../apps/reader-web/src/backend/offline/db";
import { createOutbox } from "../../apps/reader-web/src/backend/offline/outbox";
import { createBucketStore } from "../../apps/reader-web/src/state/records/buckets";
import { createHighlights } from "../../apps/reader-web/src/state/records/highlights";
import { createAnnotations } from "../../apps/reader-web/src/state/records/annotations";
import type { ReaderSession } from "../../apps/reader-web/src/session";

const HOME = process.env.HOME_URL ?? "https://www.faithnet.me";
const A2A = (process.env.A2A_BASE ?? "http://127.0.0.1:8891").replace(
  /\/$/,
  ""
);
const HANDLE = process.env.HANDLE ?? "seedreader";
const CHAPTER = process.env.PASSAGE ?? "JHN.3";

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

// Sign in the way the page's quick-connect lane does, and hand the wire to the workspace.
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
check(`signed in as ${HANDLE}`, !!token, si);
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
const me = await j(
  await fetch(`${A2A}/me`, { headers: { authorization: `Bearer ${token}` } })
);
const agent = String(
  (me.reader as { agent?: string } | undefined)?.agent ?? ""
);
check(
  "the workspace names the reader's agent",
  /^0x[0-9a-fA-F]{40}$/.test(agent),
  me
);

const session: ReaderSession = {
  token,
  estate: "faithnet",
  name: HANDLE,
  sub: agent,
  via: "quick-connect",
  wire: true,
};
process.env.A2A_BASE = A2A;

function device() {
  const backend = createA2aBackend(() => session);
  const stores = memoryStores();
  const outbox = createOutbox({
    backend,
    stores,
    isOnline: () => true,
    settleMs: 50,
    onMerged: (c, ch, b) => buckets.accept(c, ch, b),
  });
  const buckets = createBucketStore({ backend, stores, outbox });
  return {
    backend,
    outbox,
    buckets,
    highlights: createHighlights(buckets, () => backend.identity()),
    notes: createAnnotations(buckets, () => backend.identity()),
  };
}

const stamp = Date.now().toString(36);
const a = device();
await a.buckets.get("highlights", CHAPTER).ready;
await a.buckets.get("annotations", CHAPTER).ready;
await a.highlights.set(CHAPTER, 16, 16, "yellow");
await a.highlights.set(CHAPTER, 17, 18, "green");
const noteId = await a.notes.add(CHAPTER, 16, 16, `smoke note ${stamp}`);
const flushed = await a.outbox.flush();
check(
  "one device flushed its two buckets in two runs",
  flushed.merged.length === 2 && !flushed.error,
  flushed
);

const b = device();
await b.buckets.get("highlights", CHAPTER).ready;
await b.buckets.get("annotations", CHAPTER).ready;
const seen = b.highlights
  .forChapter(CHAPTER)
  .value.map((h) => `${h.colorId}:${String(h.verse)}`);
check(
  "a second device reads the highlights from the Library",
  seen.includes("yellow:16") && seen.includes("green:17,18"),
  seen
);
check(
  "…and the note",
  b.notes.forChapter(CHAPTER).value.some((n) => n.id === noteId),
  b.notes.forChapter(CHAPTER).value.map((n) => n.id)
);

// Edit the note on B from the copy it holds: a plain update, no conflict.
await b.notes.edit(CHAPTER, noteId, `smoke note ${stamp} edited`);
const f2 = await b.outbox.flush();
check(
  "an edit from the Library's copy flushed clean",
  f2.merged.length === 1 && !f2.error,
  f2
);
await a.buckets.resync();
const after = a.notes
  .forChapter(CHAPTER)
  .value.filter((n) => n.id === noteId || n.conflictOf === noteId);
check(
  "the first device sees one note with the new text",
  after.length === 1 && after[0]!.note.endsWith("edited"),
  after
);

// Tidy: tombstone what the smoke made.
await a.highlights.clear(CHAPTER, 16, 18);
await a.notes.remove(CHAPTER, noteId);
const f3 = await a.outbox.flush();
check("the marks were cleared", f3.merged.length === 2 && !f3.error, f3);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
