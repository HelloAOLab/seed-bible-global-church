#!/usr/bin/env node
/**
 * ADD THE SEED READER TO THE FAITHNET HOME'S DEMO ROSTER — the Home's `DEMO_PERSONA_KEYS` secret on the Vercel
 * project `faithnet-home` (team rpedersen3s-projects). Quick Connect at the Home lists exactly the people in that
 * roster, and the Home custodies their keys (ap-home `apps/home/server/_lib/demo-custody.ts`), so the reader's key
 * goes there once and nowhere else. Reads the Vercel CLI's login token (`npx vercel login` first), merges the one
 * entry, PATCHes the env, and prints names and counts only — never a value. The Home must be redeployed afterwards
 * for the new roster to take effect (a push to ap-home master does it).
 *
 *   node scripts/home-roster.mjs .seed/reader.local.json seedreader [--base <full roster json>]
 *
 * The env is SENSITIVE on Vercel (never readable back), so the full roster must be rebuilt locally and passed as
 * --base; without it the script refuses rather than overwrite the roster with one person.
 */
import { readFileSync } from "node:fs";
const auth = JSON.parse(
  readFileSync(
    `${process.env.HOME}/.local/share/com.vercel.cli/auth.json`,
    "utf8"
  )
);
const token = auth.token;
if (!token) throw new Error("no vercel token");
const PROJECT = "prj_DRG3AdkeBYKes88f7WYRtpwGB82C",
  TEAM = "team_5pDHXIoVgGTQ5zs7s0RQJ0Ta";
const H = {
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};
const api = async (path, init) => {
  const r = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: H,
  });
  const j = await r.json();
  if (!r.ok)
    throw new Error(`${path} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const roster = JSON.parse(readFileSync(process.argv[2], "utf8"));
const handle = process.argv[3];
const BASE =
  process.argv.indexOf("--base") >= 0
    ? process.argv[process.argv.indexOf("--base") + 1]
    : "";
const me = roster[handle];
if (!me?.sa || !me?.eoaPrivateKey) throw new Error("roster entry incomplete");
const list = await api(
  `/v9/projects/${PROJECT}/env?teamId=${TEAM}&decrypt=true`
);
const rows = list.envs.filter((e) => e.key === "DEMO_PERSONA_KEYS");
console.log(
  `DEMO_PERSONA_KEYS rows: ${rows.map((r) => `${r.id} [${(r.target || []).join(",")}] type=${r.type}`).join("; ") || "none"}`
);
for (const row of rows) {
  const full = await api(
    `/v1/projects/${PROJECT}/env/${row.id}?teamId=${TEAM}&decrypt=true`
  );
  // A SENSITIVE env (type "sensitive") is never returned decrypted — `value` comes back absent. Writing then would
  // replace the whole roster with one person (it happened once, 2026-10-21). Refuse unless the roster to merge INTO
  // is supplied explicitly (--base <file>): the operator rebuilds it from the local key files and validates it first.
  let current;
  if (typeof full.value === "string" && full.value.trim()) {
    try {
      current = JSON.parse(full.value);
    } catch {
      throw new Error(
        `row ${row.id}: current value is not JSON — not touching it`
      );
    }
  } else if (BASE) {
    current = JSON.parse(readFileSync(BASE, "utf8"));
    console.log(
      `row ${row.id}: value not readable (${row.type}); merging into --base ${BASE} (${Object.keys(current).length} people)`
    );
  } else {
    throw new Error(
      `row ${row.id}: value not readable (type ${row.type}) and no --base roster given — refusing to overwrite the roster`
    );
  }
  // With --base the whole roster is being restored, so write even when the handle is already in it.
  const keys = Object.keys(current);
  if (
    !BASE &&
    current[handle] &&
    current[handle].sa?.toLowerCase() === me.sa.toLowerCase()
  ) {
    console.log(
      `row ${row.id}: ${handle} already present (${keys.length} people)`
    );
    continue;
  }
  const next = {
    ...current,
    [handle]: {
      sa: me.sa,
      eoaPrivateKey: me.eoaPrivateKey,
      eoaAddress: me.eoaAddress,
      name: me.name,
      blurb: me.blurb,
    },
  };
  await api(`/v9/projects/${PROJECT}/env/${row.id}?teamId=${TEAM}`, {
    method: "PATCH",
    body: JSON.stringify({ value: JSON.stringify(next) }),
  });
  console.log(
    `row ${row.id}: added ${handle} (${keys.length} → ${Object.keys(next).length} people: ${[...keys, handle].join(", ")})`
  );
}
