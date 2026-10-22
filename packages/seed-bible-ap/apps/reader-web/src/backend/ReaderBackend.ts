// THE ONLY SEAM between the UI and the world (repo-layout.md): everything under state/ does its I/O through this
// interface and nothing else. Two implementations: a2a.ts (reader-a2a's harness, as the signed-in reader — their
// OWN agent writes their Library over the ask-as-me wire) and dev.ts (in memory, for tests and local pages). The
// browser never reaches reader-mcp, a Home, or the registry; the Bible text itself (backend/bible.ts) is the one
// permitted exception (ADR-0003).
import type { BucketDocument, Collection } from "@seed/library-client";
import type { BucketItem } from "@seed/seed-schema";
import type { Offering } from "../state/social/discover";
import type { Contact } from "../state/social/today";

export interface PublishSliceArgs {
  kind: string;
  /** The OSIS passage the slice is for; a customization has none. */
  passage?: string;
  title: string;
  markdown: string;
  slug?: string;
  descriptor?: Record<string, unknown>;
}

export interface SessionPassageArgs {
  translationId: string;
  bookId: string;
  chapterNumber: number;
}

export interface SessionTicket {
  sessionId: string;
  /** The one-time token for the room's WebSocket; spent on connect. */
  token: string;
  role: string;
  /** The share code (host only). */
  code?: string;
  /** Where the host's agent kept the record, when it did. */
  recordRef?: string | null;
  recordNote?: string;
}

export interface PublishReceipt {
  descriptorId: string;
  slug: string;
}

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
  /** What agents released: for a chapter, or the recent releases of some owners (the registry, via the workspace). */
  discover(q: {
    passage?: string;
    kind?: string;
    owners?: string[];
  }): Promise<Offering[]>;
  /** A slice of the reader's own to their public shelf, released (`seed.publish.slice`). */
  publishSlice(args: PublishSliceArgs): Promise<PublishReceipt>;
  /** The slice made private again; the next crawl drops it. */
  withdrawSlice(kind: string, slug: string): Promise<void>;
  /** A public shelf document's text, read for the browser by the workspace. */
  readPublic(shelf: string, path: string): Promise<string>;
  /** The reader's contacts from their Home (their agent's `person.contact.list`). */
  contacts(): Promise<Contact[]>;
  /** Open a live reading session on a passage (the reader hosts); the record goes to their Library. */
  sessionStart(passage: SessionPassageArgs): Promise<SessionTicket>;
  /** Join a session with its share code (the host needs none). A stranger is refused. */
  sessionJoin(sessionId: string, code?: string): Promise<SessionTicket>;
  /** The reader's works (playlists, plans) in their Library: list a folder, read one, save one (private). */
  listWorks(folder: WorkFolder): Promise<WorkEntry[]>;
  readWork(folder: WorkFolder, name: string): Promise<unknown>;
  /** Returns the Library file id, which a later save presents to skip the read. */
  saveWork(
    folder: WorkFolder,
    name: string,
    doc: unknown,
    id?: string
  ): Promise<{ id?: string }>;
  /** A file's bytes to the serving plane under the reader's address (content-addressed); the catalog is the reader's. */
  uploadFile(
    name: string,
    contentType: string,
    bytes: Uint8Array
  ): Promise<UploadedFile>;
  /** A link's preview, read by the serving plane. */
  linkPreview(url: string): Promise<LinkPreview>;
}

export type WorkFolder =
  | "seed-bible/playlists"
  | "seed-bible/plans"
  | "seed-bible/files"
  | "seed-bible/customizations";

export interface UploadedFile {
  url: string;
  sha256: string;
  contentType: string;
  size: number;
}
export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}
export interface WorkEntry {
  id?: string;
  name: string;
  version?: number;
}
