// Rebuild the faithnet Home's DEMO_PERSONA_KEYS from the local key files and VALIDATE every entry against the live
// roster (sa + custodian recovered from the key). Writes the merged roster to a 0600 file; prints no key material.
import { readFileSync, writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
const [, , outFile, liveFile, ...sources] = process.argv;
const live = JSON.parse(readFileSync(liveFile, "utf8")).personas;
const merged = {};
for (const src of sources) {
  const j = JSON.parse(readFileSync(src, "utf8"));
  for (const [handle, v] of Object.entries(j)) {
    if (!v || typeof v !== "object" || typeof v.eoaPrivateKey !== "string")
      continue;
    if (merged[handle]) continue; // first file wins
    merged[handle] = {
      sa: String(v.sa).toLowerCase(),
      eoaPrivateKey: v.eoaPrivateKey,
      ...(v.eoaAddress ? { eoaAddress: v.eoaAddress } : {}),
      ...(v.name ? { name: v.name } : {}),
      ...(v.blurb ? { blurb: v.blurb } : {}),
      ...(Array.isArray(v.custodies) ? { custodies: v.custodies } : {}),
    };
  }
}
let bad = 0;
for (const p of live) {
  const m = merged[p.handle];
  if (!m) {
    console.log(`✗ ${p.handle}: MISSING locally`);
    bad++;
    continue;
  }
  const eoa = privateKeyToAccount(m.eoaPrivateKey).address.toLowerCase();
  const saOk = m.sa === p.sa.toLowerCase(),
    custOk = eoa === String(p.custodian).toLowerCase();
  const liveCust = (p.custodies ?? []).length,
    localCust = (m.custodies ?? []).length;
  if (!saOk || !custOk) bad++;
  if (localCust < liveCust) {
    m.custodies = p.custodies;
  } // the live list is public (sa + name); keep the richer one
  if (!m.name && p.name) m.name = p.name; // the live roster's public name/blurb when the local file has none
  if (!m.blurb && p.blurb) m.blurb = p.blurb;
  console.log(
    `${saOk && custOk ? "✓" : "✗"} ${p.handle.padEnd(14)} sa ${saOk ? "ok" : "MISMATCH"} · custodian ${custOk ? "ok" : "MISMATCH"} · custodies live ${liveCust} local ${localCust}`
  );
}
const extra = Object.keys(merged).filter(
  (h) => !live.some((p) => p.handle === h)
);
console.log(
  `extra (not live yet): ${extra.join(", ") || "none"} · total ${Object.keys(merged).length} · problems ${bad}`
);
writeFileSync(outFile, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
if (bad) process.exit(1);
