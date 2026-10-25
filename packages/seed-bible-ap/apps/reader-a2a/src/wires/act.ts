// ACT-AS-ME (agenticprimitives spec 397 §11) — the reader's one consent that lets this workspace add and remove friends
// as them without the Home's window each time. At the Home they sign STANDING WIRES — one per act, each to THIS
// workspace's act key, 30 days — and hand them here. When a contact step parks `authority_required` at their agent,
// the wire that covers it derives the mandate the run asked for (a child bound to that run's intent, signed with the
// act key) and the same run resumes with it; their agent verifies the chain as it verifies a signature made at the
// Home. Only the acts the Home registered for this client are accepted (act_capabilities): adding and removing a
// contact. The act key is a second secret beside the asking key — a stolen asking key derives nothing.
import {
  deriveFromStanding,
  parkedNeedOf,
  standingFor,
  type StandingWireV1,
} from "@agenticprimitives/delegation";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { WireRefusal, type WireDb } from "./index";

/** The acts this workspace may hold a standing wire for — the Home's `act_capabilities` for `seed-bible-reader`. */
export const READER_ACTS = [
  "person.contact.invite",
  "person.contact.remove",
] as const;

export interface ActEnv {
  /** SECRET — this Worker's act key: the `act_delegate` on the `seed-bible-reader` client at the Home. */
  READER_ACT_PRIVATE_KEY?: string;
  DB?: WireDb;
}

export function actKeyAddress(env: ActEnv): string | null {
  return env.READER_ACT_PRIVATE_KEY
    ? privateKeyToAccount(
        env.READER_ACT_PRIVATE_KEY as Hex
      ).address.toLowerCase()
    : null;
}

/** The window a standing wire is good for, in seconds since the epoch (0 when it says none). */
export function wireUntil(s: StandingWireV1): number {
  const v = (s.requirement as { validUntil?: unknown }).validUntil;
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

/** Why these wires are not ones this reader may hand this workspace, or null when they are. */
export function actWiresProblem(
  wires: unknown,
  reader: string,
  actKey: string | null
): string | null {
  if (!actKey)
    return "this workspace holds no act key (READER_ACT_PRIVATE_KEY)";
  if (!Array.isArray(wires) || wires.length === 0)
    return "the Home returned no act wires";
  for (const w of wires as StandingWireV1[]) {
    if (
      !w ||
      w.v !== 1 ||
      typeof w.capability !== "string" ||
      !w.wire ||
      typeof w.ref !== "string" ||
      !w.requirement
    )
      return "an act wire is malformed";
    if (!(READER_ACTS as readonly string[]).includes(w.capability))
      return `this workspace does not take an act wire for ${w.capability}`;
    if (String(w.wire["delegate"] ?? "").toLowerCase() !== actKey)
      return `the act wire for ${w.capability} does not name this workspace's act key`;
    if (
      String(w.wire["delegator"] ?? "").toLowerCase() !== reader.toLowerCase()
    )
      return `the act wire for ${w.capability} is not the signed-in reader's`;
  }
  return null;
}

function db(env: ActEnv): WireDb {
  if (!env.DB)
    throw new WireRefusal(503, "this workspace has no wire store (DB)");
  return env.DB;
}

export async function keepActWires(
  env: ActEnv,
  reader: string,
  wires: unknown
): Promise<StandingWireV1[]> {
  const problem = actWiresProblem(wires, reader, actKeyAddress(env));
  if (problem)
    throw new WireRefusal(
      problem.startsWith("this workspace holds") ? 503 : 400,
      problem
    );
  await db(env)
    .prepare(
      "INSERT INTO act_grants (reader, standing_json, granted_at) VALUES (?1, ?2, ?3) ON CONFLICT(reader) DO UPDATE SET standing_json = ?2, granted_at = ?3"
    )
    .bind(reader.toLowerCase(), JSON.stringify(wires), Date.now())
    .run();
  return wires as StandingWireV1[];
}

/** The reader's standing wires still in their window (none when they never consented, or all lapsed). */
export async function actWiresFor(
  env: ActEnv,
  reader: string,
  nowSec = Math.floor(Date.now() / 1000)
): Promise<StandingWireV1[]> {
  if (!env.DB) return [];
  const row = await env.DB.prepare(
    "SELECT standing_json FROM act_grants WHERE reader = ?"
  )
    .bind(reader.toLowerCase())
    .first<{ standing_json: string }>();
  if (!row) return [];
  try {
    return (JSON.parse(row.standing_json) as StandingWireV1[]).filter(
      (s) => !wireUntil(s) || wireUntil(s) > nowSec
    );
  } catch {
    return [];
  }
}

export async function dropActWires(env: ActEnv, reader: string): Promise<void> {
  await db(env)
    .prepare("DELETE FROM act_grants WHERE reader = ?")
    .bind(reader.toLowerCase())
    .run();
}

export type Derived =
  | { ok: true; presented: Array<Record<string, unknown>>; capability: string }
  | { ok: false; reason: string };

/** The chain for a parked step from the reader's standing wires, signed with the act key — or why it stays parked. */
export async function deriveForParked(
  env: ActEnv,
  standing: readonly StandingWireV1[],
  reply: Record<string, unknown>
): Promise<Derived> {
  if (!env.READER_ACT_PRIVATE_KEY) return { ok: false, reason: "no act key" };
  const need = parkedNeedOf(reply);
  const capability =
    typeof reply["capability"] === "string" ? reply["capability"] : "";
  if (!need || !capability)
    return { ok: false, reason: "the step did not say what it needs" };
  const s = standingFor(standing, need, capability);
  if (!s) return { ok: false, reason: `no standing wire covers ${capability}` };
  // An EOA delegator: the DelegationManager recovers it from the EIP-191 hash of the digest (as the Home MCP signs).
  const account = privateKeyToAccount(env.READER_ACT_PRIVATE_KEY as Hex);
  const r = await deriveFromStanding(s, need, async (digest) =>
    account.signMessage({ message: { raw: digest } })
  );
  return r.ok ? { ok: true, presented: r.presented, capability } : r;
}
