// THE SCRIPTURE ON SCREEN, CHECKED HERE (lib/scripture/verify.ts): for a chapter the scripture content service served,
// its verses' words against their commitments, each commitment's proof against the translation's corpus root, and that
// root against the attestation scripture-resolver.svc signed for the translation. Per chapter, kept in memory: a
// chapter is checked once, whichever pane shows it. One translation's attestation is fetched and checked once.
// A chapter with no `verification` (a copy taken from a whole-translation download, or a source that does not commit
// its text) is "not checked", said so — never shown as verified.
import { signal, type Signal } from "@preact/signals";
import {
  checkAttestation,
  checkChapterText,
  type AttestationCheck,
  type ChapterProofs,
  type ChapterVerification,
  type TranslationVerification,
  type VerseCheck,
} from "@seed/scripture/verify";
import { BIBLE_API_ENDPOINT } from "../../backend/bible";

const viteEnv = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env;
/** The agent whose signature a translation's root must carry: scripture-resolver.svc on faithnet. */
export const SCRIPTURE_AGENT_SA = (
  viteEnv?.["VITE_SCRIPTURE_AGENT_SA"] ??
  "0x3064d88922223881b206dcab68b992b9b2ba90b2"
).toLowerCase();

export const RETRY_MS = 30_000;

export interface TranslationSummary {
  translationId: string;
  release: string;
  receivedAt: string;
  source: string;
  license: unknown;
  licenseUrl: string | null;
  website: string | null;
  corpusRoot: string;
  verseCount: number;
  attestation: AttestationCheck;
}
export type ChapterCheck =
  | { status: "checking" }
  | {
      status: "verified" | "differs" | "unattested";
      verses: Record<string, VerseCheck>;
      /** Verses whose words do not match, or are not in the corpus. */
      problems: string[];
      checked: number;
      translation: TranslationSummary;
    }
  | { status: "not-checked"; reason: "no-verification" | "unreachable" };

interface ChapterLike {
  translation: { id: string };
  book: { id: string };
  chapter: {
    number: number;
    content: ReadonlyArray<{
      type: string;
      number?: number;
      content?: never[];
    }>;
  };
  verification?: ChapterVerification;
}

export function createScriptureCheck(
  deps: {
    fetchImpl?: typeof fetch;
    endpoint?: string;
    agentSa?: string;
  } = {}
) {
  const fetchImpl =
    deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const endpoint = deps.endpoint ?? BIBLE_API_ENDPOINT;
  const agentSa = (deps.agentSa ?? SCRIPTURE_AGENT_SA).toLowerCase();
  const results = new Map<string, Signal<ChapterCheck>>();
  /** Unreachable is not a verdict: a later look tries again, at most every RETRY_MS (never a render-time loop). */
  const failedAt = new Map<string, number>();
  const translations = new Map<string, Promise<TranslationVerification>>();

  // A link the service gave is an absolute path on its host; anything else is relative to the endpoint.
  const getJson = async <T>(path: string): Promise<T> => {
    const res = await fetchImpl(new URL(path, endpoint).href);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return (await res.json()) as T;
  };
  const translationOf = (id: string) => {
    let p = translations.get(id);
    if (!p) {
      p = getJson<TranslationVerification>(
        `api/${encodeURIComponent(id)}/verification.json`
      );
      translations.set(id, p);
      p.catch(() => translations.delete(id));
    }
    return p;
  };

  async function run(c: ChapterLike, out: Signal<ChapterCheck>) {
    const v = c.verification;
    if (!v) {
      out.value = { status: "not-checked", reason: "no-verification" };
      return;
    }
    try {
      // The proofs arrive with the chapter (the scripture agent's read-chapter, includeProofs); else they are asked for.
      const [proofs, tv] = await Promise.all([
        v.proofs
          ? { corpusRoot: v.corpusRoot, verses: v.proofs }
          : getJson<ChapterProofs>(v.proofsLink),
        translationOf(c.translation.id),
      ]);
      const verses = checkChapterText(c.chapter.content, v, proofs);
      const attestation = await checkAttestation(tv, {
        agentSa,
        translationId: c.translation.id,
        corpusRoot: v.corpusRoot,
      });
      const problems = Object.entries(verses)
        .filter(([, s]) => s === "text-differs" || s === "not-in-corpus")
        .map(([n]) => n);
      out.value = {
        status: problems.length
          ? "differs"
          : attestation.ok
            ? "verified"
            : "unattested",
        verses,
        problems,
        checked: Object.values(verses).filter((s) => s === "verified").length,
        translation: {
          translationId: tv.translationId,
          release: tv.provenance.catalogSha256,
          receivedAt: tv.provenance.receivedAt,
          source: tv.provenance.source,
          license: tv.provenance.license,
          licenseUrl: tv.provenance.licenseUrl,
          website: tv.provenance.website,
          corpusRoot: tv.corpus.root,
          verseCount: tv.corpus.leafCount,
          attestation,
        },
      };
    } catch {
      out.value = { status: "not-checked", reason: "unreachable" };
      failedAt.set(keyOf(c), Date.now());
    }
  }

  const keyOf = (c: ChapterLike) =>
    `${c.translation.id}/${c.book.id}/${c.chapter.number}`;

  return {
    /** The check of this chapter — started on first ask, then kept. */
    of(c: ChapterLike | null | undefined): ChapterCheck | null {
      if (!c) return null;
      const key = keyOf(c);
      let s = results.get(key);
      if (!s) {
        s = signal<ChapterCheck>({ status: "checking" });
        results.set(key, s);
        void run(c, s);
      } else if ((failedAt.get(key) ?? Infinity) + RETRY_MS < Date.now()) {
        failedAt.delete(key);
        const again = s;
        queueMicrotask(() => {
          again.value = { status: "checking" };
          void run(c, again);
        });
      }
      return s.value;
    },
  };
}

export type ScriptureCheck = ReturnType<typeof createScriptureCheck>;
