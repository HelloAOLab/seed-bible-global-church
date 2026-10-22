// THE ONLY SEAM between the UI and the world (repo-layout.md): everything under state/ does its I/O through this
// interface and nothing else. Two implementations: a2a.ts (reader-a2a's harness, as the signed-in reader — their
// OWN agent writes their Library over the ask-as-me wire) and dev.ts (in memory, for tests and local pages). The
// browser never reaches reader-mcp, a Home, or the registry; the Bible text itself (backend/bible.ts) is the one
// permitted exception (ADR-0003).
import type { BucketDocument, Collection } from "@seed/library-client";
import type { BucketItem } from "@seed/seed-schema";

export type BackendErrorCode =
  | "signed-out"
  | "offline"
  | "refused"
  | "unavailable";

export class BackendError extends Error {
  constructor(
    message: string,
    readonly code: BackendErrorCode
  ) {
    super(message);
    this.name = "BackendError";
  }
}

export interface ReaderIdentity {
  /** The reader's agent address — what `heldBy` on every one of their marks is. */
  agent: string;
  name: string;
  /** Whether the workspace holds the reader's ask-as-me wire; without it their marks stay on this device. */
  wire: boolean;
}

export interface ReaderBackend {
  readonly kind: "a2a" | "dev";
  /** Who is signed in, or null — a stranger reads the Bible and nothing of theirs leaves the device. */
  identity(): ReaderIdentity | null;
  /** The reader's bucket as their Library holds it (empty when it was never saved). */
  readBucket(collection: Collection, chapter?: string): Promise<BucketDocument>;
  /** One mark into the reader's Library, idempotent by opId. */
  putMark(
    collection: Collection,
    item: BucketItem
  ): Promise<{ changed: boolean }>;
  /**
   * One run per bucket: the device's bucket merged into the reader's at item level (later update wins; a note
   * edited on both sides is kept twice), the merged bucket back. The flush of the offline outbox is made of these.
   */
  mergeBucket(
    collection: Collection,
    chapter: string | undefined,
    incoming: BucketDocument,
    opId: string
  ): Promise<BucketDocument>;
}
