// THE FAKE HOME — one ES256 key pair for the whole run (reader-a2a caches a JWKS per issuer, so the key must not
// change between tests), an id_token minter with the claims `readerFromToken()` checks (iss under the estate, aud
// the reader's client id, exp, the agent in `sub`), and a `/jwks` handler to route the issuer's host to.
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { Hono } from "hono";
import { READER_CLIENT_ID } from "../../estate/faithnet";

export const HOME_ISSUER = "https://www.faithnet.me";

interface Keys {
  privateKey: CryptoKey;
  jwk: JWK;
}
let keys: Promise<Keys> | null = null;
function homeKeys(): Promise<Keys> {
  if (!keys)
    keys = (async () => {
      const pair = await generateKeyPair("ES256", { extractable: true });
      const jwk = await exportJWK(pair.publicKey);
      return {
        privateKey: pair.privateKey,
        jwk: { ...jwk, kid: "home-test", alg: "ES256", use: "sig" },
      };
    })();
  return keys;
}

export interface IdTokenClaims {
  /** The reader's agent address (lowercase 0x…). */
  sub: string;
  name?: string;
  iss?: string;
  aud?: string;
  /** Seconds since the epoch; an hour from now by default. */
  exp?: number;
}

export interface FakeHomeJwks {
  issuer: string;
  issueIdToken(claims: IdTokenClaims): Promise<string>;
  /** The JWKS document `GET /jwks` serves. */
  jwks(): Promise<{ keys: JWK[] }>;
  /** A Hono app for the issuer's host: `/jwks` and `/.well-known/jwks.json`. */
  app: Hono;
  /** A `fetch` answering the issuer's JWKS and nothing else — for code that takes one. */
  fetch: (input: string | URL | Request) => Promise<Response>;
}

export function fakeHomeJwks(issuer = HOME_ISSUER): FakeHomeJwks {
  const jwks = async () => ({ keys: [(await homeKeys()).jwk] });
  const app = new Hono();
  app.get("/jwks", async (c) => c.json(await jwks()));
  app.get("/.well-known/jwks.json", async (c) => c.json(await jwks()));
  return {
    issuer,
    jwks,
    app,
    async issueIdToken(claims) {
      const { privateKey, jwk } = await homeKeys();
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        ...(claims.name ? { name: claims.name } : {}),
        canonical_agent_id: `eip155:34348:${claims.sub.toLowerCase()}`,
      })
        .setProtectedHeader({ alg: "ES256", kid: jwk.kid! })
        .setIssuer(claims.iss ?? issuer)
        .setAudience(claims.aud ?? READER_CLIENT_ID)
        .setSubject(claims.sub.toLowerCase())
        .setIssuedAt(now)
        .setExpirationTime(claims.exp ?? now + 3600)
        .sign(privateKey);
    },
    fetch: async (input) =>
      app.request(input instanceof Request ? input : String(input)),
  };
}
