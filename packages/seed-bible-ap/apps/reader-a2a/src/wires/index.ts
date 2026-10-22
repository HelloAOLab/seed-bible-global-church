// THE WIRE — agenticprimitives spec 412 W5. At sign-in the reader's Home returns, beside the id_token, an `ask-as-me`
// delegation: reader → THIS Worker's asking key, pinned to `harness.ask`, revocable by them under Connected assistants.
// With it the workspace puts a supplied plan to the READER'S OWN agent, which writes their Library as them
// (agents-and-skills.md "How as the person actually works"). This module keeps and checks wires; it never signs with
// anything but the asking key, which is a revocable delegate, not an identity.
import { checkSessionWireShape } from "@agenticprimitives/a2a";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { TOWN } from "../../../../estate/faithnet";

export interface DelegationWire {
  delegator: string;
  delegate: string;
  authority: string;
  caveats: Array<{ enforcer: string; terms: string; args?: string }>;
  salt: string;
  signature: string;
}

/** The wire table's store as this module uses it: the Worker binds D1, a test binds a map (test/helpers/wires.ts). */
export interface WireStatement {
  bind(...values: unknown[]): WireStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface WireDb {
  prepare(sql: string): WireStatement;
}

export interface WireEnv {
  /** SECRET — this Worker's asking key: the `ask_delegate` on the `seed-bible-reader` client at the Home. */
  READER_ASK_PRIVATE_KEY?: string;
  DB?: WireDb;
}

export class WireRefusal extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "WireRefusal";
  }
}

export function askingKeyAddress(env: WireEnv): string | null {
  return env.READER_ASK_PRIVATE_KEY
    ? privateKeyToAccount(
        env.READER_ASK_PRIVATE_KEY as Hex
      ).address.toLowerCase()
    : null;
}

/** Why a wire is not one this reader may hand this workspace, or null when it is. Pure apart from the clock. */
export function wireProblem(
  wire: DelegationWire,
  reader: string,
  askKey: string | null,
  nowSec = Math.floor(Date.now() / 1000)
): string | null {
  if (!askKey)
    return "this workspace holds no asking key (READER_ASK_PRIVATE_KEY)";
  if (String(wire.delegator ?? "").toLowerCase() !== reader.toLowerCase())
    return "the delegation is not the signed-in reader's";
  if (String(wire.delegate ?? "").toLowerCase() !== askKey)
    return "the delegation does not name this workspace's asking key";
  if (
    !Array.isArray(wire.caveats) ||
    typeof wire.signature !== "string" ||
    !wire.signature
  )
    return "the delegation is malformed";
  const why = checkSessionWireShape(
    wire as never,
    {
      timestamp: TOWN.contracts.enforcers.timestamp,
      allowedMethods: TOWN.contracts.enforcers.allowedMethods,
    },
    nowSec,
    { skill: "harness.ask" }
  );
  return why
    ? `the Home returned a delegation that is not an ask-as-me wire (${why})`
    : null;
}

function db(env: WireEnv): WireDb {
  if (!env.DB)
    throw new WireRefusal(503, "this workspace has no wire store (DB)");
  return env.DB;
}

export async function wireFor(
  env: WireEnv,
  reader: string
): Promise<DelegationWire | null> {
  const row = await db(env)
    .prepare("SELECT wire_json FROM wires WHERE reader = ?")
    .bind(reader.toLowerCase())
    .first<{ wire_json: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.wire_json) as DelegationWire;
  } catch {
    return null;
  }
}

/** Keep a reader's wire — after checking it is THEIRS, names THIS key, and is the shape their agent will demand. */
export async function keepWire(
  env: WireEnv,
  reader: string,
  wire: DelegationWire
): Promise<void> {
  const problem = wireProblem(wire, reader, askingKeyAddress(env));
  if (problem)
    throw new WireRefusal(
      problem.startsWith("this workspace holds") ? 503 : 400,
      problem
    );
  await db(env)
    .prepare(
      "INSERT INTO wires (reader, wire_json, connected_at) VALUES (?1, ?2, ?3) ON CONFLICT(reader) DO UPDATE SET wire_json = ?2, connected_at = ?3"
    )
    .bind(reader.toLowerCase(), JSON.stringify(wire), Date.now())
    .run();
}

export async function dropWire(env: WireEnv, reader: string): Promise<void> {
  await db(env)
    .prepare("DELETE FROM wires WHERE reader = ?")
    .bind(reader.toLowerCase())
    .run();
}
