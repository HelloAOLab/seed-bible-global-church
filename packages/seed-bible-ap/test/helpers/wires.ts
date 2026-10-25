// A synthetic ask-as-me wire the way the Home mints one (ap-home `issueAskAsMeDelegation`): reader → asking key,
// Timestamp(0, validUntil) + AllowedMethods([harness.ask]), ROOT authority. Signed with a throwaway custodian key
// — tests check the SHAPE this workspace demands; the person's agent is what verifies the signature.
import { skillSelector } from "@agenticprimitives/a2a";
import {
  encodeTimestampTerms,
  encodeAllowedMethodsTerms,
  hashDelegation,
  ROOT_AUTHORITY,
} from "@agenticprimitives/delegation";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { TOWN } from "../../estate/faithnet";
import type { DelegationWire, WireDb } from "../../apps/reader-a2a/src/wires";

export const TEST_READER_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
export const TEST_ASK_KEY =
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex;

export async function syntheticAskAsMeWire(opts: {
  reader: string;
  askKey: string;
  validUntil?: number;
  skill?: string;
}): Promise<DelegationWire> {
  const validUntil =
    opts.validUntil ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const caveats = [
    {
      enforcer: TOWN.contracts.enforcers.timestamp,
      terms: encodeTimestampTerms(0, validUntil),
      args: "0x",
    },
    {
      enforcer: TOWN.contracts.enforcers.allowedMethods,
      terms: encodeAllowedMethodsTerms([
        skillSelector(opts.skill ?? "harness.ask"),
      ]),
      args: "0x",
    },
  ];
  const salt = 1n;
  const unsigned = {
    delegator: opts.reader as Hex,
    delegate: opts.askKey as Hex,
    authority: ROOT_AUTHORITY,
    caveats: caveats as never,
    salt,
    signature: "0x" as Hex,
  };
  const signature = await privateKeyToAccount(TEST_READER_KEY).signMessage({
    message: {
      raw: hashDelegation(
        unsigned,
        TOWN.chainId,
        TOWN.contracts.delegationManager as Hex
      ),
    },
  });
  return { ...unsigned, caveats, salt: salt.toString(), signature };
}

/** A D1 stand-in for the tables the wire stores use (`wires`, `act_grants`): only the statements `wires/index.ts` and
 *  `wires/act.ts` issue are answered — an upsert of (key, json, time), a select of the json by key, a delete by key. */
export function fakeWireDb(): WireDb {
  const tables = new Map<string, Map<string, string>>();
  const table = (sql: string) => {
    const name = /act_grants/.test(sql) ? "act_grants" : "wires";
    if (!tables.has(name)) tables.set(name, new Map());
    return { name, rows: tables.get(name)! };
  };
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const { name, rows } = table(sql);
    const column = name === "act_grants" ? "standing_json" : "wire_json";
    const stmt = {
      bind: (...a: unknown[]) => {
        args = a;
        return stmt;
      },
      first: async <T>() => {
        const r = rows.get(String(args[0]));
        return (r !== undefined ? { [column]: r } : null) as T | null;
      },
      run: async () => {
        if (sql.startsWith("INSERT"))
          rows.set(String(args[0]), String(args[1]));
        else if (sql.startsWith("DELETE")) rows.delete(String(args[0]));
        return { success: true } as never;
      },
    };
    return stmt;
  };
  return { prepare } as unknown as WireDb;
}
