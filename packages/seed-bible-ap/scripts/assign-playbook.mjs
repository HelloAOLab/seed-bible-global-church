#!/usr/bin/env node
/**
 * ASSIGN A PLAYBOOK TO A PERSON'S OWN AGENT — the first-run step hard-problems §5 describes, done the way the Home's
 * consent ceremony does it: the compiled archetype definition from the skills registry is written into the agent's
 * OWN vault as `ap.archetype-assignment.v1`, with the PERSON'S OWN Home session (`/connect/channels`). It grants
 * nothing: every act still waits on the person's authority; what changes is what the agent knows how to do — and,
 * for Seed Bible, whether it OFFERS `library.file.read` / `library.files.list` at all (ap-home harness-run.ts only
 * offers Library reads from a playbook that carries them; the saves are always offered).
 *
 * Default: the estate's `person-steward` baseline (context agentic-trust), which carries the Library reads and every
 * other person act. The `seed-reader` pack cannot replace it yet (its compiled tools collide on `library.file.read`,
 * see docs/adr/0006); composing the two is open with the estate.
 *
 *   node scripts/assign-playbook.mjs seedreader                                  # person-steward
 *   node scripts/assign-playbook.mjs seedreader seed seed-reader                 # context, archetype
 */
const HOME = process.env.HOME_URL ?? "https://www.faithnet.me";
const REGISTRY =
  process.env.SKILLS_REGISTRY ??
  "https://skills-a2a-production.richardpedersen3.workers.dev";
const [
  handle = "seedreader",
  ctx = "agentic-trust",
  archetype = "person-steward",
] = process.argv.slice(2);
const j = async (r) => {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t.slice(0, 200), _status: r.status };
  }
};

const def = await j(
  await fetch(
    `${REGISTRY}/context/contexts/${ctx}/archetypes/${archetype}/definition?fresh=${Date.now()}`,
    { headers: { "user-agent": "Mozilla/5.0 (assign-playbook)" } }
  )
);
if (!def?.definition)
  throw new Error(
    `no ${ctx}/${archetype} definition: ${JSON.stringify(def).slice(0, 200)}`
  );
const ids = (def.definition.tools ?? []).map((t) => t.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length)
  throw new Error(
    `refusing to pin ${archetype}: duplicate tool ids ${[...new Set(dupes)].join(", ")} — the harness would reject it`
  );
console.log(
  `${ctx}/${archetype} digest ${def.digest} · ${ids.length} tools · warnings ${def.warnings?.length ?? 0}`
);
const record = {
  type: "ap.archetype-assignment.v1",
  archetypeId: def.definition.archetypeId,
  archetypeVersion: def.definition.archetypeVersion,
  definitionDigest: def.digest,
  definition: def.definition,
};

const si = await j(
  await fetch(`${HOME}/connect/demo-signin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle, client_id: "seed-bible-reader" }),
  })
);
const token = si.homeSession;
const agent = String(si.agent ?? "").toLowerCase();
if (!token || !agent)
  throw new Error(
    `${handle}: no Home session (${JSON.stringify(si).slice(0, 160)})`
  );
const out = await j(
  await fetch(`${HOME}/connect/channels`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "archetypeAssignmentPut",
      communityId: agent,
      record,
    }),
  })
);
console.log(`${handle} ${agent}: ${JSON.stringify(out).slice(0, 200)}`);
if (out.ok === false) process.exit(1);
