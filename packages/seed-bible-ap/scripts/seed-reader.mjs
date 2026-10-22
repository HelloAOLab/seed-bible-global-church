#!/usr/bin/env node
/**
 * THE SEED DEMO READER — a person on the faithnet estate (faithchain 34348) with the credentials reader-a2a's
 * workspace admits: a custodian EOA (the key), the Smart Agent it custodies (the identity — `{ mode 0,
 * custodians [eoa], salt 0 }`, the Home's SIWE bootstrap spec, so "sign in with that wallet" lands on the same
 * account), a typed `<handle>.me` name, and a vault key bound at the estate MCP. Same recipe as
 * verifiable-content-demo `apps/demo-bible-mcp/scripts/faithnet/mint-persons.mjs`.
 *
 * TWO STEPS, SEPARATED ON PURPOSE:
 *   (default)  generate — the key, the derived account address (one read against the chain), the public row in
 *              estate/seed-reader.faithnet.json, the secret roster in .seed/reader.local.json (0600, gitignored),
 *              and apps/reader-a2a/.dev.vars so the reader can sign in to the local stack as `dev:<handle>`.
 *              Touches nothing outside this repo.
 *   --mint     the on-chain ceremony — deploy the account (gasless, through the estate A2A's paymaster), declare the
 *              person type, bind the vault key. Idempotent. Writes to the live chain and the estate; run it when
 *              you mean it. The `<handle>.me` NAME is bought at the Home (`.me` is a priced root, spec 431).
 *
 * After --mint, two operator steps make the real Home sign-in work (README "Seed demo reader"):
 *   · add the roster entry to the faithnet Home's DEMO_PERSONA_KEYS so Quick Connect lists them;
 *   · register the `seed-bible-reader` client at the Home (redirect URIs + the relying delegate).
 *
 *   pnpm seed:reader                       # generate (handle seedreader, name "Seed Reader")
 *   pnpm seed:reader -- --handle ruthie --name "Ruth Reader"
 *   pnpm seed:reader -- --mint             # the on-chain ceremony for the generated reader
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  AgentAccountClient,
  buildExecuteBatchCallData,
} from "@agenticprimitives/agent-account";
import {
  agentNameRegistryAbi,
  agentProfileResolverTypeAbi,
  buildDeclareAgentTypeCalls,
  buildSetPrimaryNameCall,
  buildSetAddressAttributeCall,
  buildSetBytes32AttributeCall,
  buildSetStringAttributeCall,
  namehash,
  AGENT_KIND_ID,
  PREDICATE_ID,
} from "@agenticprimitives/agent-naming";
import {
  buildVaultKeyUseCaveat,
  hashDelegation,
  ROOT_AUTHORITY,
} from "@agenticprimitives/delegation";
import { createPublicClient, http, keccak256, toBytes, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ROOT = new URL("../", import.meta.url);
const CONTRACTS = JSON.parse(
  readFileSync(new URL("estate/faithchain.json", ROOT), "utf8")
);
const CHAIN = Number(CONTRACTS.chainId);
const ESTATE = {
  id: "faithnet",
  home: "https://www.faithnet.me",
  a2a: "https://a2a.faithnet.io",
  mcp: "https://mcp.faithnet.io",
};
const RPC = process.env.RPC_URL || "https://a2a.faithnet.io/rpc";
const A2A = process.env.A2A_BASE || ESTATE.a2a;
const MCP = (process.env.MCP_URL || ESTATE.mcp).replace(/\/$/, "");
const ORIGIN = process.env.CSRF_ORIGIN || ESTATE.home;
const CLIENT_ID = "seed-bible-reader";
const WORKSPACE = "seed-reader.workspace";

const ROSTER = new URL(".seed/reader.local.json", ROOT);
const PUBLIC = new URL("estate/seed-reader.faithnet.json", ROOT);
const DEV_VARS = new URL("apps/reader-a2a/.dev.vars", ROOT);

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")
    ? args[i + 1]
    : dflt;
};
const MINT = args.includes("--mint");
const handle = flag("handle", "seedreader").toLowerCase();
const displayName = flag("name", "Seed Reader");
if (!/^[a-z0-9]{3,32}$/.test(handle))
  throw new Error(
    "--handle must be 3–32 lowercase letters/digits (a root-level .me label)"
  );
const blurb = `The Seed Bible reader workspace's demo reader — signs in at the faithnet Home and says hello through ${WORKSPACE}.`;

const readJson = (url, dflt) =>
  existsSync(url) ? JSON.parse(readFileSync(url, "utf8")) : dflt;
const roster = readJson(ROSTER, {});
const pub = readJson(PUBLIC, {
  v: 1,
  note: "The Seed Bible reader workspace on faithchain — public addresses only; keys live in .seed/ (gitignored) and, for Quick Connect, in the Home's roster.",
  chainId: CHAIN,
  estate: ESTATE.id,
  clientId: CLIENT_ID,
  workspace: {
    name: WORKSPACE,
    sa: null,
    note: "chartered through a steward's Home (service.create) — fill in once it exists",
  },
  people: {},
});
function save() {
  mkdirSync(new URL(".seed/", ROOT), { recursive: true });
  writeFileSync(ROSTER, `${JSON.stringify(roster, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(PUBLIC, `${JSON.stringify(pub, null, 2)}\n`);
}

// ── generate ──────────────────────────────────────────────────────────────────────────────────────
const entry = (roster[handle] ??= {
  name: displayName,
  blurb,
  chainId: CHAIN,
  estate: ESTATE.id,
  eoaPrivateKey: generatePrivateKey(),
});
const signer = privateKeyToAccount(entry.eoaPrivateKey);
entry.eoaAddress = signer.address;
const client = createPublicClient({ transport: http(RPC) });
const accounts = new AgentAccountClient({
  rpcUrl: RPC,
  chainId: CHAIN,
  entryPoint: CONTRACTS.entryPoint,
  factory: CONTRACTS.agentAccountFactory,
});
const spec = { mode: 0, custodians: [signer.address], salt: 0n };
let sa = entry.sa ?? null;
let deployed = false;
try {
  if (Number(await client.getChainId()) !== CHAIN)
    throw new Error(`RPC ${RPC} is not chain ${CHAIN}`);
  sa = (await accounts.getAddressForAgentAccount(spec)).toLowerCase();
  deployed = await accounts.isDeployed(sa);
} catch (e) {
  console.warn(
    `! could not derive the account on chain (${e instanceof Error ? e.message : e}); the address is left ${sa ?? "unset"} until the RPC answers`
  );
}
entry.sa = sa;
entry.name = displayName;
pub.people[handle] = {
  name: `${handle}.me`,
  displayName,
  sa,
  custodianEoa: signer.address,
  deployed,
  blurb,
};
save();

// The local dev lane: reader-a2a admits `dev:<handle>` as this person (DEV_STUB_SESSIONS=1, never deployed).
// Beside it, the workspace's ASKING KEY — the `ask_delegate` the Home registers for `seed-bible-reader` — kept in
// .seed/ (gitignored) and handed to the Worker as `READER_ASK_PRIVATE_KEY`. A revocable delegate, never an identity.
const ASK_KEY = new URL(".seed/reader-a2a-ask.local.json", ROOT);
let askKey = existsSync(ASK_KEY)
  ? JSON.parse(readFileSync(ASK_KEY, "utf8"))
  : null;
if (!askKey?.privateKey) {
  const privateKey = generatePrivateKey();
  askKey = {
    purpose:
      "reader-a2a asking key — the ask_delegate the Home registers for seed-bible-reader; a revocable delegate, never an identity",
    privateKey,
    address: privateKeyToAccount(privateKey).address,
  };
  writeFileSync(ASK_KEY, `${JSON.stringify(askKey, null, 2)}\n`, {
    mode: 0o600,
  });
}
const existingVars = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, "utf8") : "";
const marker =
  /^A2A_INTERNAL_MARKER=(.+)$/m.exec(existingVars)?.[1] ??
  randomBytes(24).toString("hex");
const devReaders = Object.fromEntries(
  Object.entries(pub.people).map(([h, p]) => [
    h,
    { sa: p.sa ?? "0x" + "0".repeat(39) + "1", name: p.displayName },
  ])
);
writeFileSync(
  DEV_VARS,
  [
    "# Written by scripts/seed-reader.mjs — local dev only, gitignored. Never deploy DEV_STUB_SESSIONS.",
    "DEV_STUB_SESSIONS=1",
    `DEV_READERS=${JSON.stringify(devReaders)}`,
    `A2A_INTERNAL_MARKER=${marker}`,
    `READER_ASK_PRIVATE_KEY=${askKey.privateKey}`,
    "",
  ].join("\n"),
  { mode: 0o600 }
);

// The serving plane's dev secrets: its run-object marker and the operator's admin door for reindex / wipe.
const SVC_VARS = new URL("apps/seed-bible-a2a/.dev.vars", ROOT);
const svcExisting = existsSync(SVC_VARS) ? readFileSync(SVC_VARS, "utf8") : "";
const svcMarker =
  /^A2A_INTERNAL_MARKER=(.+)$/m.exec(svcExisting)?.[1] ??
  randomBytes(24).toString("hex");
const adminToken =
  /^ADMIN_TOKEN=(.+)$/m.exec(svcExisting)?.[1] ??
  randomBytes(18).toString("hex");
writeFileSync(
  SVC_VARS,
  [
    "# Written by scripts/seed-reader.mjs — local dev only, gitignored.",
    `A2A_INTERNAL_MARKER=${svcMarker}`,
    `ADMIN_TOKEN=${adminToken}`,
    "",
  ].join("\n"),
  { mode: 0o600 }
);

console.log(`${handle}.me — ${displayName}`);
console.log(`  custodian EOA   ${signer.address}`);
console.log(
  `  smart agent     ${sa ?? "(unknown — RPC did not answer)"}${deployed ? " (deployed)" : " (counterfactual, not yet deployed)"}`
);
console.log(`  roster (keys)   ${ROSTER.pathname}`);
console.log(`  public row      ${PUBLIC.pathname}`);
console.log(
  `  dev session     apps/reader-a2a/.dev.vars → sign in locally as dev:${handle}`
);
console.log(
  `  asking key      ${askKey.address} (reader-a2a ask_delegate at the Home)`
);

if (!MINT) {
  console.log(
    `\nNot minted on chain. To deploy the account, declare the person type and bind the vault key on faithchain: pnpm seed:reader -- --mint --handle ${handle}`
  );
  process.exit(0);
}

// ── mint (--mint) ─────────────────────────────────────────────────────────────────────────────────
if (!sa)
  throw new Error(
    "cannot mint without the derived account address (the RPC must answer)"
  );

async function csrf() {
  const r = await fetch(`${A2A}/auth/csrf`, { headers: { origin: ORIGIN } });
  const setc = (
    typeof r.headers.getSetCookie === "function"
      ? r.headers.getSetCookie()
      : [r.headers.get("set-cookie")]
  ).filter(Boolean);
  const j = await r.json();
  return {
    token: j.token || j.csrfToken || j.csrf || "",
    cookie: setc.map((c) => c.split(";")[0]).join("; "),
  };
}
const H = (c) => ({
  "content-type": "application/json",
  origin: ORIGIN,
  "x-csrf-token": c.token,
  cookie: c.cookie,
});
const j = async (r) => {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { _raw: t.slice(0, 200), _status: r.status };
  }
};

async function deployPerson() {
  if (await accounts.isDeployed(sa)) return sa;
  const c = await csrf();
  const built = await j(
    await fetch(`${A2A}/session/deploy`, {
      method: "POST",
      headers: H(c),
      body: JSON.stringify({ custodians: [signer.address], salt: "0" }),
    })
  );
  if (!built.ok || !built.userOpHash || !built.userOp)
    throw new Error(`deploy build: ${JSON.stringify(built).slice(0, 300)}`);
  const signature = await signer.signMessage({
    message: { raw: built.userOpHash },
  });
  const sub = await j(
    await fetch(`${A2A}/session/deploy/submit`, {
      method: "POST",
      headers: H(c),
      body: JSON.stringify({ userOp: { ...built.userOp, signature } }),
    })
  );
  if (!sub.ok || !sub.deployedAddress)
    throw new Error(`deploy submit: ${JSON.stringify(sub).slice(0, 300)}`);
  if (sub.deployedAddress.toLowerCase() !== sa)
    throw new Error(
      `address mismatch: derived ${sa}, deployed ${sub.deployedAddress}`
    );
  return sa;
}

/** One sponsored userOp from the account, custodian-signed (EIP-191 over the hash — the wallet rail). */
async function submitCalls(calls) {
  const callData = buildExecuteBatchCallData(calls);
  const c = await csrf();
  let last = "";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 4000));
    const b = await j(
      await fetch(`${A2A}/account/build-call-userop`, {
        method: "POST",
        headers: H(c),
        body: JSON.stringify({ sender: sa, callData }),
      })
    );
    if (!b.ok || !b.userOpHash) {
      last = JSON.stringify(b).slice(0, 240);
      continue;
    }
    const signature = await signer.signMessage({
      message: { raw: b.userOpHash },
    });
    const s = await j(
      await fetch(`${A2A}/account/submit-call-userop`, {
        method: "POST",
        headers: H(c),
        body: JSON.stringify({ userOp: { ...b.userOp, signature } }),
      })
    );
    if (s.ok) return s.transactionHash;
    last = JSON.stringify(s).slice(0, 240);
    if (!/AA2[05]|nonce|not deployed/i.test(last)) break;
  }
  throw new Error(`userOp did not land: ${last}`);
}

/** spec 346 §3.6 — declare the person type on the account's own profile and, when the account already owns
 *  `<handle>.me`, set it as primary with its records. Idempotent per step.
 *
 *  THE NAME ITSELF IS NOT CLAIMED HERE. Since spec 431 (2026-10-05) `.me` is a PRICED root on faithchain: a name is
 *  bought with Sheqel from the person's treasury under a ClaimTicket the Home's naming gate signs
 *  (`/connect/naming-ticket`, `/naming/register`). The legacy permissionless register call reverts, so the reader
 *  buys their name at the Home once they are signed in there; nothing else here depends on it. */
async function claimTyped() {
  const name = `${handle}.me`;
  const node = namehash(name);
  const zero = "0x0000000000000000000000000000000000000000";
  const owner = String(
    await client
      .readContract({
        address: CONTRACTS.agentNameRegistry,
        abi: agentNameRegistryAbi,
        functionName: "owner",
        args: [node],
      })
      .catch(() => zero)
  ).toLowerCase();
  const primary = String(
    await client
      .readContract({
        address: CONTRACTS.agentNameRegistry,
        abi: agentNameRegistryAbi,
        functionName: "primaryName",
        args: [sa],
      })
      .catch(() => "0x")
  ).toLowerCase();
  const registered = await client.readContract({
    address: CONTRACTS.agentProfileResolver,
    abi: agentProfileResolverTypeAbi,
    functionName: "isRegistered",
    args: [sa],
  });
  const declared = registered
    ? String(
        await client.readContract({
          address: CONTRACTS.agentProfileResolver,
          abi: agentProfileResolverTypeAbi,
          functionName: "getBytes32Property",
          args: [sa, PREDICATE_ID.agentType],
        })
      ).toLowerCase()
    : "";
  const typeDeclared = declared === keccak256(toHex("person")).toLowerCase();
  const calls = [];
  if (!typeDeclared)
    calls.push(
      ...buildDeclareAgentTypeCalls({
        profileResolver: CONTRACTS.agentProfileResolver,
        agent: sa,
        agentType: "person",
        registered,
        displayName,
      })
    );
  let nameNote;
  if (owner === zero)
    nameNote = `${name} is free but priced (spec 431) — buy it at ${ESTATE.home}/naming/register once signed in`;
  else if (owner !== sa)
    nameNote = `${name} is owned by ${owner}, not this reader — pick another --handle before buying`;
  else if (primary !== node.toLowerCase()) {
    calls.push(
      buildSetPrimaryNameCall({ registry: CONTRACTS.agentNameRegistry, node })
    );
    calls.push(
      buildSetAddressAttributeCall({
        resolver: CONTRACTS.agentNameResolver,
        node,
        predicate: PREDICATE_ID.addr,
        value: sa,
      })
    );
    calls.push(
      buildSetBytes32AttributeCall({
        resolver: CONTRACTS.agentNameResolver,
        node,
        predicate: PREDICATE_ID.agentKind,
        value: AGENT_KIND_ID.person,
      })
    );
    calls.push(
      buildSetStringAttributeCall({
        resolver: CONTRACTS.agentNameResolver,
        node,
        predicate: PREDICATE_ID.displayName,
        value: displayName,
      })
    );
    nameNote = `${name} set as primary with records`;
  } else nameNote = `${name} already primary`;
  if (!calls.length) return `type person already declared; ${nameNote}`;
  const tx = await submitCalls(calls);
  return `type person declared tx ${tx}; ${nameNote}`;
}

/** spec 278 — the vault-key ceremony as the Home's onboarding runs it: provision (owner-control proof) + bind. */
async function activateVault() {
  const sign = (digest) => signer.signMessage({ message: { raw: digest } });
  const status = await j(
    await fetch(`${MCP}/custody/vault-key/is-bound?owner=${sa}`)
  );
  if (status.bound && status.allowedResources?.includes("vault:*"))
    return "vault bound";
  const info = await j(
    await fetch(`${MCP}/custody/vault-key/server-info?owner=${sa}`)
  );
  if (!info.kmsKeyRef)
    return `vault: server-info has no kmsKeyRef (${JSON.stringify(info).slice(0, 120)})`;
  const issuedAt = Math.floor(Date.now() / 1000);
  const challenge = keccak256(
    toBytes(
      ["demo-mcp:vault-key-provision:v1", sa, String(issuedAt)].join("\n")
    )
  );
  const prov = await j(
    await fetch(`${MCP}/custody/vault-key/provision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner: sa,
        issuedAt,
        proof: await sign(challenge),
      }),
    })
  );
  if (!prov.ok || !prov.kmsKeyRef)
    return `vault provision failed: ${prov.error_description ?? prov.detail ?? JSON.stringify(prov).slice(0, 120)}`;
  const params = {
    vaultId: String(info.serverId ?? "").trim() || "demo-mcp",
    kmsKeyRef: prov.kmsKeyRef,
    serverKey: info.serverKey ?? "0x0000000000000000000000000000000000000001",
    allowedResources: info.defaultResources ?? [
      "person-pii",
      "org-sensitive",
      "profile",
      "vault:*",
    ],
    classificationCeiling: info.classificationCeiling ?? "regulated.high",
    ops: info.ops ?? ["read", "write"],
  };
  const validUntil = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90;
  let salt = 0n;
  for (const b of randomBytes(16)) salt = (salt << 8n) | BigInt(b);
  const d = {
    delegator: sa,
    delegate: params.serverKey,
    authority: ROOT_AUTHORITY,
    salt,
    signature: "0x",
    caveats: [
      buildVaultKeyUseCaveat({
        vaultId: params.vaultId,
        kmsKeyRef: params.kmsKeyRef,
        resources: params.allowedResources,
        classificationCeiling: params.classificationCeiling,
        ops: params.ops,
        noSubdelegation: true,
      }),
    ],
  };
  d.signature = await sign(
    hashDelegation(d, CHAIN, CONTRACTS.delegationManager)
  );
  const bind = await j(
    await fetch(`${MCP}/custody/vault-key/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        owner: sa,
        ...params,
        expiresAt: new Date(validUntil * 1000).toISOString(),
        authorization: { ...d, salt: salt.toString() },
      }),
    })
  );
  return bind.ok
    ? "vault ACTIVATED"
    : `vault bind failed: ${bind.reason ?? bind.error ?? JSON.stringify(bind).slice(0, 120)}`;
}

console.log("\nMinting on faithchain…");
process.stdout.write("  1. person account… ");
console.log(await deployPerson());
pub.people[handle].deployed = true;
save();
process.stdout.write("  2. typed claim… ");
console.log(await claimTyped());
process.stdout.write("  3. vault key… ");
console.log(await activateVault());
console.log(
  `\nDone. Operator steps for a real Home sign-in: add ${ROSTER.pathname}#${handle} to the faithnet Home's DEMO_PERSONA_KEYS (Quick Connect), and register the "${CLIENT_ID}" client at the Home.`
);
