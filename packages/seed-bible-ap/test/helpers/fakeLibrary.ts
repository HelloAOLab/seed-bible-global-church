// THE FAKE LIBRARY — a person's Library in memory with the six tools the reader's agent runs against it, answering
// in the shapes ap-home's agent-runtime answers (library-tools.ts): a re-save by id is a new version, an omitted id
// mints one, a save that says nothing about `accessPolicy` keeps the declared one; a publish is append-only and
// version-monotonic; the public reads answer "unknown" and "not public" as ONE refusal; text reads are capped at
// 12 000 characters. `effectiveAccessPolicy` and `publicShelf` are copied VERBATIM from
// ~/ap-home/apps/agent-runtime/src/library-tools.ts (2026-10-22) so the fake decides visibility the way the runtime does.

export type LibraryAccessPolicy = "public" | "private";

export interface LibraryRelease {
  canonicalId: string;
  version: string;
  bundleRoot: string;
  owner: string;
  publisher: string;
  riskTier: "low" | "medium" | "high" | "critical";
  releaseId: string;
  signature?: string;
  signed: boolean;
  publishedAt: number;
}

export interface LibraryEntry {
  id: string;
  kind: string;
  name: string;
  source?: string;
  folder?: string;
  isFolder?: boolean;
  contentType?: string;
  bytesB64?: string;
  pointer?: string;
  size?: number;
  version?: number;
  createdAt?: number;
  contentCommitment?: string;
  commitment?: string;
  accessPolicy?: LibraryAccessPolicy;
  grants?: unknown[];
  releases?: LibraryRelease[];
}

export const LIBRARY_TEXT_MAX_CHARS = 12_000;

const pathOf = (e: LibraryEntry): string =>
  e.folder ? `${e.folder}/${e.name}` : e.name;

// ── verbatim from ~/ap-home/apps/agent-runtime/src/library-tools.ts (2026-10-22) ──────────────────────────────
// prettier-ignore
export function effectiveAccessPolicy(entries: LibraryEntry[], e: LibraryEntry): LibraryAccessPolicy {
  if (e.accessPolicy === 'public' || e.accessPolicy === 'private') return e.accessPolicy;
  const byPath = new Map<string, LibraryEntry>();
  for (const f of entries) if (f.isFolder) byPath.set(pathOf(f), f);
  const parts = (e.folder ?? '').split('/').filter(Boolean);
  for (let i = parts.length; i > 0; i--) {
    const f = byPath.get(parts.slice(0, i).join('/'));
    if (f?.accessPolicy === 'public' || f?.accessPolicy === 'private') return f.accessPolicy;
  }
  return 'private';
}

/** The shelf: every entry (folders too) whose effective policy is public, bodies stripped. */
// prettier-ignore
export function publicShelf(entries: LibraryEntry[]): LibraryEntry[] {
  return entries.filter((e) => effectiveAccessPolicy(entries, e) === 'public');
}
// ── end of the verbatim copy ──────────────────────────────────────────────────────────────────────────────────

const TEXT_KINDS = new Set(["skill", "ttl", "md", "json-ld"]);
const isText = (e: LibraryEntry): boolean =>
  TEXT_KINDS.has(e.kind) ||
  /^text\/|^application\/(json|ld\+json|x-yaml|yaml|xml)/.test(
    e.contentType ?? ""
  );
const encodeText = (s: string): string => btoa(unescape(encodeURIComponent(s)));
const decodeText = (b64: string): string =>
  decodeURIComponent(escape(atob(b64)));
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const KINDS = new Set(["skill", "ttl", "md", "json-ld", "image"]);
const PUBLISHABLE = new Set(["skill", "md", "json-ld"]);
const defaultMime = (kind: string): string =>
  (
    ({
      skill: "text/markdown",
      md: "text/markdown",
      ttl: "text/turtle",
      "json-ld": "application/ld+json",
      image: "image/png",
    }) as Record<string, string>
  )[kind] ?? "application/octet-stream";

async function sha256Hex(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `0x${[...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

const view = (e: LibraryEntry) => ({
  id: e.id,
  name: e.name,
  kind: e.kind,
  folder: e.folder ?? "",
  path: pathOf(e),
  contentType: e.contentType ?? null,
  size: e.size ?? null,
  version: e.version ?? null,
  ...(e.createdAt ? { createdAt: new Date(e.createdAt).toISOString() } : {}),
  text: isText(e),
  accessPolicy: e.accessPolicy ?? null,
  commitment: e.contentCommitment ?? e.commitment ?? null,
  isFolder: e.isFolder === true,
  releases: (e.releases ?? []).map((r) => ({
    releaseId: r.releaseId,
    version: r.version,
    signed: r.signed,
    owner: r.owner,
    publishedAt: r.publishedAt,
  })),
});

const shelfView = (e: LibraryEntry) => {
  const { releases: _all, ...v } = view(e);
  const r = e.releases?.[e.releases.length - 1];
  return {
    ...v,
    release: r
      ? {
          releaseId: r.releaseId,
          version: r.version,
          signed: r.signed,
          owner: r.owner,
          publishedAt: new Date(r.publishedAt).toISOString(),
          canonicalId: r.canonicalId,
        }
      : null,
  };
};

const clean = (folder: unknown) =>
  typeof folder === "string" ? folder.replace(/^\/+|\/+$/g, "") : "";

/** Find by id, else by name (exact, then contains); a folder narrows — the runtime's `findEntries`, shortened. */
function findEntries(
  entries: LibraryEntry[],
  q: { id?: string; name?: string; folder?: string }
): LibraryEntry[] {
  const folder = clean(q.folder).toLowerCase();
  const inFolder = folder
    ? entries.filter(
        (e) =>
          (e.folder ?? "").toLowerCase() === folder ||
          pathOf(e).toLowerCase().startsWith(`${folder}/`)
      )
    : entries;
  if (q.id) return inFolder.filter((e) => e.id === q.id);
  const name = (q.name ?? "").trim().toLowerCase();
  if (!name) return [];
  const exact = inFolder.filter(
    (e) => e.name.toLowerCase() === name || pathOf(e).toLowerCase() === name
  );
  if (exact.length) return exact;
  return inFolder.filter((e) => e.name.toLowerCase().includes(name));
}

export const LIBRARY_TOOL_IDS = [
  "library.file.save",
  "library.file.visibility",
  "library.file.publish",
  "library.files.list",
  "library.file.read",
  "library.public.list",
  "library.public.read",
] as const;

export interface FakeLibrary {
  /** The catalogs by owner (lowercase agent address). */
  readonly catalogs: Map<string, LibraryEntry[]>;
  /** Every tool call answered, in order. */
  readonly calls: Array<{
    owner: string;
    toolId: string;
    args: Record<string, unknown>;
  }>;
  entries(owner: string): LibraryEntry[];
  /** The text of `folder/name` in `owner`'s Library, or null. */
  text(owner: string, folder: string, name: string): string | null;
  /** Put an entry straight in (a test's arrangement, not an act). */
  seed(
    owner: string,
    entry: Partial<LibraryEntry> & { name: string; text?: string }
  ): LibraryEntry;
  /** One tool, as the owner's agent would run it. Throws on a malformed act, the way the runtime does. */
  run(
    owner: string,
    toolId: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
}

export function fakeLibrary(): FakeLibrary {
  const catalogs = new Map<string, LibraryEntry[]>();
  const calls: FakeLibrary["calls"] = [];
  let minted = 0;
  const entries = (owner: string) => {
    const o = owner.toLowerCase();
    let list = catalogs.get(o);
    if (!list) catalogs.set(o, (list = []));
    return list;
  };

  const upsert = async (
    list: LibraryEntry[],
    a: Record<string, unknown>
  ): Promise<LibraryEntry> => {
    const name = String(a.name ?? "")
      .trim()
      .slice(0, 120);
    if (!name) throw new Error("a document needs a name");
    const kind = KINDS.has(String(a.kind)) ? String(a.kind) : "md";
    const id =
      typeof a.id === "string" && ID_RE.test(a.id)
        ? a.id
        : `art-${(++minted).toString(36).padStart(4, "0")}`;
    const isFolder = a.isFolder === true;
    const bytesB64 = isFolder
      ? undefined
      : typeof a.bytesB64 === "string" && a.bytesB64
        ? a.bytesB64
        : typeof a.text === "string"
          ? encodeText(a.text)
          : undefined;
    const idx = list.findIndex((x) => x.id === id);
    const prev = idx >= 0 ? list[idx]! : null;
    const policy =
      a.accessPolicy === "public" || a.accessPolicy === "private"
        ? (a.accessPolicy as LibraryAccessPolicy)
        : prev?.accessPolicy;
    const entry: LibraryEntry = {
      id,
      kind,
      name,
      source: "blob",
      folder: clean(a.folder).slice(0, 256),
      ...(isFolder ? { isFolder: true } : {}),
      contentType:
        typeof a.contentType === "string" && a.contentType
          ? a.contentType
          : isFolder
            ? "inode/directory"
            : defaultMime(kind),
      ...(bytesB64 ? { bytesB64 } : {}),
      size: bytesB64 ? bytesB64.length : 0,
      createdAt: Date.now(),
      version: prev ? (prev.version ?? 1) + 1 : 1,
      ...(bytesB64 ? { contentCommitment: await sha256Hex(bytesB64) } : {}),
      grants: prev?.grants ?? [],
      ...(prev?.releases ? { releases: prev.releases } : {}),
      ...(policy ? { accessPolicy: policy } : {}),
    };
    if (prev) list[idx] = entry;
    else list.push(entry);
    return entry;
  };

  const find = (list: LibraryEntry[], args: Record<string, unknown>) => {
    const matches = findEntries(list, {
      ...(typeof args.id === "string" ? { id: args.id } : {}),
      ...(typeof args.name === "string" ? { name: args.name } : {}),
      ...(typeof args.folder === "string" ? { folder: args.folder } : {}),
    });
    if (!matches.length)
      throw new Error(
        `no document named "${String(args.name ?? args.id ?? "")}" in the Library`
      );
    if (matches.length > 1)
      throw new Error(`${matches.length} documents match — which one?`);
    return matches[0]!;
  };

  const readText = (entry: LibraryEntry, args: Record<string, unknown>) => {
    const full = decodeText(entry.bytesB64 ?? "");
    const offset =
      typeof args.offset === "number" && args.offset > 0
        ? Math.floor(args.offset)
        : 0;
    const text = full.slice(offset, offset + LIBRARY_TEXT_MAX_CHARS);
    return {
      text,
      chars: full.length,
      ...(offset ? { offset } : {}),
      truncated: full.length > offset + text.length,
    };
  };

  return {
    catalogs,
    calls,
    entries,
    text(owner, folder, name) {
      const e = entries(owner).find(
        (x) => clean(x.folder) === clean(folder) && x.name === name
      );
      return e?.bytesB64 ? decodeText(e.bytesB64) : null;
    },
    seed(owner, partial) {
      const list = entries(owner);
      const { text, ...rest } = partial;
      const bytesB64 = text !== undefined ? encodeText(text) : rest.bytesB64;
      const entry: LibraryEntry = {
        id: rest.id ?? `art-${(++minted).toString(36).padStart(4, "0")}`,
        kind: rest.kind ?? "md",
        source: "blob",
        contentType: rest.contentType ?? defaultMime(rest.kind ?? "md"),
        version: 1,
        createdAt: Date.now(),
        ...rest,
        name: partial.name,
        folder: clean(rest.folder),
        ...(bytesB64 ? { bytesB64, size: bytesB64.length } : {}),
      };
      list.push(entry);
      return entry;
    },
    async run(ownerRaw, toolId, args) {
      const owner = ownerRaw.toLowerCase();
      calls.push({ owner, toolId, args });
      const list = entries(owner);
      switch (toolId) {
        case "library.file.save": {
          const entry = await upsert(list, args);
          return {
            saved: true,
            owner,
            file: view(entry),
            effectiveAccessPolicy: effectiveAccessPolicy(list, entry),
          };
        }
        case "library.file.visibility": {
          const policy =
            args.accessPolicy === "public" || args.accessPolicy === "private"
              ? (args.accessPolicy as LibraryAccessPolicy)
              : null;
          if (!policy)
            throw new Error('accessPolicy must be "public" or "private"');
          const entry = find(list, args);
          entry.accessPolicy = policy;
          return {
            declared: true,
            owner,
            file: view(entry),
            effectiveAccessPolicy: effectiveAccessPolicy(list, entry),
          };
        }
        case "library.file.publish": {
          const entry = find(list, args);
          if (!PUBLISHABLE.has(entry.kind) && !entry.isFolder)
            throw new Error(
              "only a skill, a page (md, json-ld) or a bundle folder can be published as a release"
            );
          if (!entry.isFolder && !entry.contentCommitment)
            throw new Error("a page with no content cannot be published");
          const n = (entry.releases?.length ?? 0) + 1;
          const release: LibraryRelease = {
            canonicalId: `0xc${entry.id}`,
            version: `${n}.0.0`,
            bundleRoot: entry.contentCommitment ?? `blob:${entry.id}`,
            owner,
            publisher: owner,
            riskTier: "low",
            releaseId: `0xr${entry.id}-${n}`,
            signature: `0xsig-${entry.id}-${n}`,
            signed: true,
            publishedAt: Date.now(),
          };
          entry.releases = [...(entry.releases ?? []), release];
          return { published: true, owner, file: view(entry), release };
        }
        case "library.files.list": {
          const folder = clean(args.folder);
          const max =
            typeof args.max === "number" && args.max > 0
              ? Math.min(args.max, 100)
              : 50;
          const rows = list
            .filter(
              (e) =>
                !folder ||
                (e.folder ?? "") === folder ||
                (e.folder ?? "").startsWith(`${folder}/`)
            )
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
          const files = rows.slice(0, max).map(view);
          return {
            owner,
            count: rows.length,
            files,
            truncated: rows.length > files.length,
          };
        }
        case "library.file.read": {
          const matches = findEntries(list, {
            ...(typeof args.id === "string" ? { id: args.id } : {}),
            ...(typeof args.name === "string" ? { name: args.name } : {}),
            ...(typeof args.folder === "string" ? { folder: args.folder } : {}),
          });
          if (!matches.length)
            return {
              read: false,
              owner,
              refused: `no document named "${String(args.name ?? args.id ?? "")}" in this Library — ${list.length ? `the Library holds: ${list.slice(0, 12).map(pathOf).join(", ")}` : "it holds no documents"}`,
            };
          if (matches.length > 1)
            return {
              read: false,
              owner,
              which: matches.slice(0, 8).map(view),
              refused: `${matches.length} documents match — which one?`,
            };
          const entry = matches[0]!;
          if (!isText(entry))
            return {
              read: false,
              named: true,
              owner,
              file: view(entry),
              untrusted: true,
              note: `${entry.name} is not readable as text`,
            };
          return {
            read: true,
            owner,
            file: view(entry),
            ...readText(entry, args),
          };
        }
        case "library.public.list": {
          const shelf = publicShelf(list);
          const folder = clean(args.folder);
          const max =
            typeof args.max === "number" && args.max > 0
              ? Math.min(args.max, 200)
              : 100;
          const rows = shelf.filter(
            (e) =>
              !folder ||
              (e.folder ?? "") === folder ||
              (e.folder ?? "").startsWith(`${folder}/`) ||
              (e.isFolder && pathOf(e) === folder)
          );
          const files = rows.slice(0, max).map(shelfView);
          return {
            owner,
            count: rows.length,
            files,
            truncated: rows.length > files.length,
          };
        }
        case "library.public.read": {
          const docs = publicShelf(list).filter((e) => !e.isFolder);
          const matches = findEntries(docs, {
            ...(typeof args.id === "string" ? { id: args.id } : {}),
            ...(typeof args.name === "string" ? { name: args.name } : {}),
            ...(typeof args.folder === "string" ? { folder: args.folder } : {}),
          });
          // Unknown and not-public are ONE answer: a private id is not on the shelf, and the shelf is all there is to say.
          if (!matches.length)
            return {
              read: false,
              owner,
              refused: `no public document named "${String(args.name ?? args.id ?? "")}" on this shelf`,
            };
          const entry = matches[0]!;
          if (!isText(entry))
            return {
              read: true,
              owner,
              file: shelfView(entry),
              bytesB64: entry.bytesB64 ?? "",
              contentType: entry.contentType ?? null,
              untrusted: true,
            };
          return {
            read: true,
            owner,
            file: shelfView(entry),
            ...readText(entry, args),
            untrusted: true,
          };
        }
        default:
          throw new Error(`${toolId} is not a Library capability`);
      }
    },
  };
}
