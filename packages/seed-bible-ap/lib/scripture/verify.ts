// CHECKING THE SCRIPTURE ON SCREEN. The scripture content service (scripture-api.faithnet.io) serves each chapter with a
// commitment over every verse's words and the verse's leaf in its translation's corpus; `{n}.proofs.json` proves each
// leaf into the corpus root; the translation's `verification.json` carries a CorpusAttestation over that root, signed
// as scripture-resolver.svc through its key delegate. A reader checks all three here, on the device:
//   1. the words SHOWN re-hash to the verse's commitment (nothing changed them on the way — a cache, a copy, a proxy);
//   2. the commitment's leaf walks to the corpus root with its proof (the verse is part of that translation's corpus);
//   3. the corpus root is the one the agent signed for that translation (the attestation's signer is the delegate the
//      credential names, acting for the expected agent).
// What this does NOT do on the device: confirm on chain that the delegate key is still authorized by the agent's
// account (ERC-1271 on the owner-signed leaf) — that check belongs to a validator, as the agent's own /verify says.
//
// The verse-text rule is the content service's own (verifiable-content-demo packages/scripture-store/src/verseText.ts),
// copied: test/unit/lib/scripture-verify.test.ts holds the two to the same answers on live chapters.
import {
  contentCommitment,
  leafHash,
  verifyInclusion,
} from "@agenticprimitives/content-primitives";
import { verifyCredentialStructural } from "@agenticprimitives/verifiable-credentials";
import { recoverAddress, type Hex } from "viem";

export type VerseItem =
  | string
  | {
      text?: string;
      noteId?: number;
      lineBreak?: boolean;
      heading?: string;
      poem?: number;
      wordsOfJesus?: boolean;
    };

const CLOSING = /^[.,;:!?)\]}’”»…—]/;
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

/** A verse's words as one string — what its commitment is over (footnote markers, line breaks, ¶ carry no words). */
export function verseText(items: readonly VerseItem[]): string {
  let s = "";
  for (const x of items) {
    const words = (
      typeof x === "string" ? x : typeof x.text === "string" ? x.text : ""
    ).replace(/^\s*¶\s*/, "");
    if (!words.trim()) continue;
    s +=
      !s || CLOSING.test(words.trimStart()) || /—\s*$/.test(s)
        ? words
        : ` ${words}`;
  }
  return flat(s);
}

export interface ChapterVerification {
  edition: string;
  version: string;
  corpusRef: string;
  corpusRoot: string;
  issuer: string;
  normalization: string;
  proofsLink: string;
  verses: Record<string, { commitment: string; leaf: number }>;
}
export interface ChapterProofs {
  corpusRoot: string;
  verses: Record<string, { leaf: number; proof: string[] }>;
}

export type VerseCheck =
  | "verified"
  | "text-differs"
  | "not-in-corpus"
  | "no-commitment"
  | "repeated-number";

/**
 * Each verse shown, by number: its words re-hashed and compared with its commitment, the commitment's leaf walked to
 * the root. A number the chapter repeats (a passage printed in two traditions) was committed once, for its first
 * occurrence; a later one is `repeated-number` under `{n}@{k}`.
 */
export function checkChapterText(
  content: ReadonlyArray<{
    type: string;
    number?: number;
    content?: VerseItem[];
  }>,
  verification: ChapterVerification,
  proofs: ChapterProofs
): Record<string, VerseCheck> {
  const out: Record<string, VerseCheck> = {};
  const seen = new Map<number, number>();
  const root = verification.corpusRoot as Hex;
  for (const item of content) {
    if (item.type !== "verse" || typeof item.number !== "number") continue;
    const words = verseText(item.content ?? []);
    if (!words) continue;
    const times = (seen.get(item.number) ?? 0) + 1;
    seen.set(item.number, times);
    if (times > 1) {
      out[`${item.number}@${times}`] = "repeated-number";
      continue;
    }
    const key = String(item.number);
    const c = verification.verses[key];
    if (!c) {
      out[key] = "no-commitment";
      continue;
    }
    if (contentCommitment(words).value !== c.commitment) {
      out[key] = "text-differs";
      continue;
    }
    const p = proofs.verses[key];
    out[key] =
      p &&
      proofs.corpusRoot === verification.corpusRoot &&
      verifyInclusion(leafHash(c.commitment as Hex), p.proof as Hex[], root)
        ? "verified"
        : "not-in-corpus";
  }
  return out;
}

export interface TranslationVerification {
  translationId: string;
  corpus: {
    root: string;
    leafCount: number;
    ref: string;
    version: string;
    issuer: string;
  };
  provenance: {
    source: string;
    catalogSha256: string;
    receivedAt: string;
    license: unknown;
    licenseUrl: string | null;
    website: string | null;
    omitted: string[];
    refused: string[];
  };
  attestation: {
    issuer?: string;
    credentialSubject?: {
      translationId?: string;
      corpusRoot?: string;
      corpusRef?: string;
    };
    proof?: {
      delegatingSigner?: { delegateKey?: string; delegatorIssuer?: string };
    };
  } & Record<string, unknown>;
}
export type AttestationCheck =
  | { ok: true; signer: string; agent: string }
  | { ok: false; reason: string };

/** The translation's root is the one `agentSa` signed for it, through the delegate its attestation names. */
export async function checkAttestation(
  v: TranslationVerification,
  expected: { agentSa: string; translationId: string; corpusRoot: string }
): Promise<AttestationCheck> {
  const a = v.attestation;
  const subject = a?.credentialSubject;
  if (!a || !subject) return { ok: false, reason: "no attestation" };
  if (subject.translationId !== expected.translationId)
    return { ok: false, reason: "the attestation is for another translation" };
  if (
    subject.corpusRoot !== expected.corpusRoot ||
    v.corpus.root !== expected.corpusRoot
  )
    return { ok: false, reason: "the attested root is not this chapter's" };
  const ds = a.proof?.delegatingSigner;
  if (
    !ds?.delegateKey ||
    String(ds.delegatorIssuer ?? "").toLowerCase() !==
      expected.agentSa.toLowerCase()
  )
    return { ok: false, reason: "not signed for the expected agent" };
  const vr = verifyCredentialStructural(a as never);
  if (!vr.structural || !vr.expectedDigest || !vr.proofValue)
    return { ok: false, reason: "the attestation is malformed" };
  const signer = await recoverAddress({
    hash: vr.expectedDigest as Hex,
    signature: vr.proofValue as Hex,
  }).catch(() => null);
  if (!signer || signer.toLowerCase() !== ds.delegateKey.toLowerCase())
    return { ok: false, reason: "the signature is not the delegate's" };
  return { ok: true, signer, agent: expected.agentSa };
}
