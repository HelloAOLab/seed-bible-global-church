// THE TOWN AND THE ESTATE this reader triad is configured for.
//
// A town is one chain and the services every estate on it shares (ap-town `towns/faithchain/town.yaml`);
// an estate is one Home and the people under it. The rows below are public facts copied from that file and
// from `estate/faithchain.json` (the contract deployment). Nothing here grants anything: which estates a
// deployment SERVES is `ESTATE_IDS` on the worker, and a reader's id_token is accepted only from a served
// estate's Home. Pattern: verifiable-content-demo `apps/demo-bible-a2a/src/estates.ts`.

import deployment from "./faithchain.json";

export const TOWN = {
  id: "faithchain",
  label: "faithnet.town",
  chainId: 34348,
  /** The public read relay (no per-app token); the town's gateway at rpc.faithnet.io needs one. */
  rpcUrl: "https://a2a.faithnet.io/rpc",
  namingService: "https://names.faithnet.io",
  portal: "https://faithnet.town",
  contracts: {
    entryPoint: deployment.entryPoint,
    agentAccountFactory: deployment.agentAccountFactory,
    delegationManager: deployment.delegationManager,
    universalSignatureValidator: deployment.universalSignatureValidator,
    agentNameRegistry: deployment.agentNameRegistry,
    agentNameResolver: deployment.agentNameResolver,
    agentProfileResolver: deployment.agentProfileResolver,
    enforcers: {
      timestamp: deployment.timestampEnforcer,
      allowedMethods: deployment.allowedMethodsEnforcer,
      allowedTargets: deployment.allowedTargetsEnforcer,
    },
    /** The `.me` root every person's name is claimed under. */
    meSubregistry: deployment.permissionlessSubregistries.me,
  },
} as const;

export type EstateId = "faithnet";

export interface Estate {
  id: EstateId;
  label: string;
  /** The Home that issues this estate's readers' id_tokens. */
  home: string;
  homeHost: string;
  /** An established member's token is issued by their own Home subdomain under this zone. */
  homeZone: string;
  /** The estate's agent runtime (every person's agent answers here) and its vault MCP. */
  a2a: string;
  vaultMcp: string;
  homeMcp: string;
  edge: string;
}

export const ALL_ESTATES: readonly Estate[] = [
  {
    id: "faithnet",
    label: "Faithnet",
    home: "https://www.faithnet.me",
    homeHost: "www.faithnet.me",
    homeZone: "faithnet.me",
    a2a: "https://a2a.faithnet.io",
    vaultMcp: "https://mcp.faithnet.io",
    homeMcp: "https://home-mcp.faithnet.io",
    edge: "https://edge.faithnet.io",
  },
];

export const DEFAULT_ESTATE_IDS = "faithnet";

/** The OIDC client id this reader registers at the Home; tokens must carry it as `aud`. */
export const READER_CLIENT_ID = "seed-bible-reader";

export type EstateEnv = { ESTATE_IDS?: string };

/** The estates this deployment serves, in order. An unknown id drops out rather than guessing a Home. */
export function servedEstates(env: EstateEnv): Estate[] {
  const ids = (env.ESTATE_IDS ?? DEFAULT_ESTATE_IDS)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return ids
    .map((id) => ALL_ESTATES.find((e) => e.id === id))
    .filter((e): e is Estate => !!e);
}

export function estateById(id: string | undefined | null): Estate | null {
  return ALL_ESTATES.find((e) => e.id === id) ?? null;
}

/** Which served estate's Home issued an id_token with this `iss`, or null (a refusal upstream). */
export function estateOfIssuer(env: EstateEnv, origin: string): Estate | null {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  if (u.pathname !== "/" && u.pathname !== "") return null;
  if (u.search || u.hash) return null;
  const h = u.hostname.toLowerCase();
  const estates = servedEstates(env);
  // Local dev: a Home on localhost issues for whichever estate this deployment serves first.
  if (u.protocol !== "https:") {
    return h === "localhost" || h === "127.0.0.1" ? (estates[0] ?? null) : null;
  }
  return (
    estates.find(
      (e) =>
        h === e.homeHost || h === e.homeZone || h.endsWith(`.${e.homeZone}`)
    ) ?? null
  );
}
