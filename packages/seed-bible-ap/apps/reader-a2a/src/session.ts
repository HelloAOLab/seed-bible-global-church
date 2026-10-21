// WHO THE READER IS — established from their Home id_token, verified here against that Home's own JWKS
// (issuer under a served estate, ES256, aud = this reader's client id, exp). A failure is "no reader",
// never a weaker check. Pattern: verifiable-content-demo `apps/demo-openbook-reader/src/server/session.ts`.
//
// The ONE exception is local dev: with DEV_STUB_SESSIONS = "1" a `dev:<handle>` token is the seed demo
// reader `scripts/seed-reader.mjs` wrote into `.dev.vars` (DEV_READERS). It is off in every deployed env.

import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { Address } from "@agenticprimitives/types";
import {
  estateOfIssuer,
  READER_CLIENT_ID,
  type EstateId,
} from "../../../estate/faithnet";

export interface SessionEnv {
  ESTATE_IDS?: string;
  DEV_STUB_SESSIONS?: string;
  /** JSON: { "<handle>": { "sa": "0x…", "name": "…" } } — the seed demo reader(s), local dev only. */
  DEV_READERS?: string;
}

export interface Reader {
  /** The reader's Smart Agent address (lowercase) — their identity on the chain. */
  agent: Address;
  name: string;
  estate: EstateId;
  via: "home" | "dev-stub";
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwks(url: string) {
  let set = jwksCache.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, set);
  }
  return set;
}

export function devReaders(
  env: SessionEnv
): Record<string, { sa: string; name: string }> {
  if (env.DEV_STUB_SESSIONS !== "1" || !env.DEV_READERS) return {};
  try {
    return JSON.parse(env.DEV_READERS) as Record<
      string,
      { sa: string; name: string }
    >;
  } catch {
    return {};
  }
}

function devReader(env: SessionEnv, token: string): Reader | null {
  const handle = token.slice(4).toLowerCase();
  const row = devReaders(env)[handle];
  if (!row || !/^0x[0-9a-fA-F]{40}$/.test(row.sa)) return null;
  return {
    agent: row.sa.toLowerCase() as Address,
    name: row.name,
    estate: "faithnet",
    via: "dev-stub",
  };
}

/** The reader a session token names, or null. Throws nothing: a bad token is simply nobody. */
export async function readerFromToken(
  env: SessionEnv,
  token: string | null | undefined
): Promise<Reader | null> {
  if (!token) return null;
  if (token.startsWith("dev:")) return devReader(env, token);
  try {
    const iss = String(decodeJwt(token).iss ?? "");
    const estate = estateOfIssuer(env, iss);
    if (!estate) return null;
    const { payload } = await jwtVerify(
      token,
      jwks(`${iss.replace(/\/$/, "")}/jwks`),
      {
        issuer: iss,
        audience: READER_CLIENT_ID,
        algorithms: ["ES256"],
      }
    );
    const sub = String(payload["canonical_agent_id"] ?? payload.sub ?? "");
    const address = /0x[0-9a-fA-F]{40}/.exec(sub)?.[0]?.toLowerCase();
    if (!address) return null;
    const name = String(payload["name"] ?? payload["agent_name"] ?? address);
    return { agent: address as Address, name, estate: estate.id, via: "home" };
  } catch {
    return null;
  }
}

/** The bearer out of an `Authorization` header, or null. */
export function bearerOf(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  return /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() ?? null;
}
