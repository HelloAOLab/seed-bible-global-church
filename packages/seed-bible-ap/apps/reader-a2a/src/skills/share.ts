// SHARING WITH A FRIEND — what the reader shares with one person, kept in the reader's OWN Library and read by that
// person's agent under a grant the reader signed (ap-home `library.grant.issue` / `library.granted.read`, slice S4/S5).
// Each friend has one folder, `seed-bible/shared/<their address>`, holding one shelf document that lists what was
// shared with them (a note, a prayer…, its words inline). The friend's agent is granted the FOLDER once, so a later
// share is a save and nothing more; the first one also asks the reader to sign the grant at their Home and to send
// the friend the link (`messaging.direct.send`), each a step parked for their signature (`/you?run=`).
// This workspace keeps nothing: the shelf is the reader's, the grant is theirs to revoke.
import type { ToolSpec, ToolInvoker } from "@agenticprimitives/orchestration";
import {
  isMissing,
  readStep,
  saveJsonLdStep,
  type LibraryRead,
  type LibrarySaved,
} from "../../../../lib/library-client";
import { WireRefusal } from "../wires";
import { agentFor, type VaultEnv } from "./vault";

export const SHARED_FOLDER = "seed-bible/shared";
export const SHELF_NAME = "_shared-with.jsonld";
/** A year: the longest a Library grant may hold; the reader renews by sharing again after it lapses. */
export const GRANT_DAYS = 365;

export const SHARE_KINDS = ["note", "prayer", "plan", "playlist"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export interface SharedItem {
  /** The reader's own key for what was shared (a note's id): sharing it again replaces it. */
  key: string;
  kind: ShareKind;
  title: string;
  /** The OSIS passage it is about, when it is about one. */
  passage?: string;
  /** Its words, inline (a shelf stays one small document the friend reads in one call). */
  text: string;
  sharedAt: string;
}

export interface SharedShelf {
  "@type": "seed:SharedShelf";
  /** Whose Library this is. */
  owner: string;
  /** The friend it is shared with. */
  with: string;
  items: SharedItem[];
}

const ADDRESS = /^0x[0-9a-f]{40}$/;
export function addressOf(raw: unknown, what = "friend"): string {
  const a = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!ADDRESS.test(a))
    throw new WireRefusal(
      400,
      `${what} must be an agent address (0x and 40 hex)`
    );
  return a;
}
export const folderFor = (friend: string) =>
  `${SHARED_FOLDER}/${friend.toLowerCase()}`;

export function emptyShelf(owner: string, friend: string): SharedShelf {
  return { "@type": "seed:SharedShelf", owner, with: friend, items: [] };
}

export function parseShelf(
  text: string,
  owner: string,
  friend: string
): SharedShelf {
  try {
    const d = JSON.parse(text) as Partial<SharedShelf>;
    if (d && Array.isArray(d.items))
      return {
        ...emptyShelf(owner, friend),
        ...d,
        items: d.items.filter(isItem),
      };
  } catch {
    /* an unreadable shelf starts again empty rather than failing every share */
  }
  return emptyShelf(owner, friend);
}

const isItem = (x: unknown): x is SharedItem =>
  !!x &&
  typeof (x as SharedItem).key === "string" &&
  (SHARE_KINDS as readonly string[]).includes((x as SharedItem).kind) &&
  typeof (x as SharedItem).text === "string";

/** The shelf with one item shared (replacing any of the same key), or taken off it. Newest first. */
export function withItem(
  shelf: SharedShelf,
  item: SharedItem | { key: string; remove: true }
): SharedShelf {
  const rest = shelf.items.filter((i) => i.key !== item.key);
  return { ...shelf, items: "remove" in item ? rest : [item, ...rest] };
}

/** A grant as `library.grants.list` lists it (ap-home library-tools.ts). */
export interface ListedGrant {
  delegate?: string;
  resources?: string[];
  revoked?: boolean;
  expired?: boolean;
  validUntil?: string;
  grant?: unknown;
}

/** The grant on this friend's folder that still holds (not revoked, not expired), latest first; or null. */
export function liveGrantFor(
  grants: ListedGrant[],
  friend: string
): ListedGrant | null {
  const scope = `${folderFor(friend)}/*`;
  const live = grants.filter(
    (g) =>
      g.grant &&
      !g.revoked &&
      !g.expired &&
      (g.delegate ?? "").toLowerCase() === friend.toLowerCase() &&
      (g.resources ?? []).some((r) => r.endsWith(scope))
  );
  live.sort((a, b) =>
    String(b.validUntil ?? "").localeCompare(String(a.validUntil ?? ""))
  );
  return live[0] ?? null;
}

const SHARE_PUT = "seed.share.put";
const SHARE_GRANT = "seed.share.grant";
const SHARE_GRANTS = "seed.share.grants";
const SHARE_NOTIFY = "seed.share.notify";
const SHARE_FETCH = "seed.share.fetch";

const str = (props: string[]) =>
  Object.fromEntries(props.map((p) => [p, { type: "string" }]));

export const SHARE_TOOLS: ToolSpec[] = [
  {
    id: SHARE_PUT,
    description:
      "Shares one thing with one friend, or takes it back: saves it on that friend's shelf in the signed-in reader's own Library (seed-bible/shared/<friend>). Args: friend (0x…), key, kind (note | prayer | plan | playlist), title, passage, text; or remove: yes.",
    inputSchema: {
      type: "object",
      properties: str([
        "friend",
        "key",
        "kind",
        "title",
        "passage",
        "text",
        "remove",
      ]),
    },
    answers: ["share this note with my friend"],
  },
  {
    id: SHARE_GRANTS,
    description:
      "The read grant the signed-in reader has given a friend on their shelf, if one still holds (library.grants.list). Args: friend (0x…).",
    inputSchema: { type: "object", properties: str(["friend"]) },
    answers: ["can my friend read what I shared"],
    establishes: "lookup",
  },
  {
    id: SHARE_GRANT,
    description:
      "Asks the signed-in reader's agent to grant a friend a read of their shelf for a year (library.grant.issue). It needs the reader's signature at their Home: the answer is `parked` with the run to sign, or the signed grant.",
    inputSchema: { type: "object", properties: str(["friend"]) },
    answers: ["let my friend read what I share"],
  },
  {
    id: SHARE_NOTIFY,
    description:
      "Sends the friend a direct message from the signed-in reader (messaging.direct.send), the link to what was shared. It needs the reader's signature at their Home: the answer is `parked` with the run to sign, or sent. Args: friend (0x…), message.",
    inputSchema: { type: "object", properties: str(["friend", "message"]) },
    answers: ["tell my friend I shared something"],
  },
  {
    id: SHARE_FETCH,
    description:
      "Reads what someone shared with the signed-in reader: their shelf, from their Library, by the reader's own agent under the grant they were given (library.granted.fetch). Args: publisher (0x…), id (the shelf's document id), grant (the signed grant, wire form).",
    inputSchema: {
      type: "object",
      properties: { ...str(["publisher", "id"]), grant: { type: "object" } },
    },
    answers: ["what did my friend share with me"],
    establishes: "lookup",
  },
];

/** The person agent's answer to library.granted.fetch (ap-home library-granted-fetch.ts). */
interface GrantedFetch {
  read?: boolean;
  text?: string;
  refused?: string;
}

export function shareInvokers(
  env: VaultEnv,
  readerOf: () => string
): Record<string, ToolInvoker> {
  const agent = () => agentFor(env, readerOf());

  async function readShelf(friend: string) {
    const a = await agent();
    const folder = folderFor(friend);
    try {
      const out = await a.run<LibraryRead>(
        [readStep(folder, SHELF_NAME)],
        "read what I shared with my friend"
      );
      const r = out.result;
      if (!r.read) {
        if (isMissing(r))
          return { a, shelf: emptyShelf(a.reader, friend), id: undefined };
        throw new WireRefusal(
          502,
          r.refused ?? `your agent could not read ${folder}/${SHELF_NAME}`
        );
      }
      return {
        a,
        shelf: parseShelf(r.text ?? "", a.reader, friend),
        id: r.file?.id,
      };
    } catch (e) {
      if (e instanceof WireRefusal && /no document named/i.test(e.message))
        return { a, shelf: emptyShelf(a.reader, friend), id: undefined };
      throw e;
    }
  }

  return {
    [SHARE_PUT]: async (_t, args) => {
      const friend = addressOf(args.friend);
      const key = String(args.key ?? "").trim();
      if (!key) throw new WireRefusal(400, "key names what is shared");
      const { a, shelf, id } = await readShelf(friend);
      let next: SharedShelf;
      if (String(args.remove ?? "") === "yes")
        next = withItem(shelf, { key, remove: true });
      else {
        const kind = String(args.kind ?? "note") as ShareKind;
        if (!(SHARE_KINDS as readonly string[]).includes(kind))
          throw new WireRefusal(
            400,
            `kind is one of ${SHARE_KINDS.join(", ")}`
          );
        next = withItem(shelf, {
          key,
          kind,
          title: String(args.title ?? "").slice(0, 200),
          ...(args.passage ? { passage: String(args.passage) } : {}),
          text: String(args.text ?? "").slice(0, 4000),
          sharedAt: new Date().toISOString(),
        });
      }
      const out = await a.run<LibrarySaved>(
        [
          saveJsonLdStep(
            folderFor(friend),
            SHELF_NAME,
            JSON.stringify(next),
            id
          ),
        ],
        "keep what I shared with my friend"
      );
      if (!out.result.saved || !out.result.file?.id)
        throw new WireRefusal(
          502,
          out.result.refused ?? "your agent did not keep the share"
        );
      return {
        shelf: out.result.file.id,
        count: next.items.length,
        runRef: out.runRef,
      };
    },

    [SHARE_GRANTS]: async (_t, args) => {
      const friend = addressOf(args.friend);
      const a = await agent();
      const out = await a.run<{ grants?: ListedGrant[] }>(
        [{ toolId: "library.grants.list", args: { delegate: friend } }],
        "the read grants I gave my friend"
      );
      const live = liveGrantFor(out.result.grants ?? [], friend);
      return live
        ? { grant: live.grant, validUntil: live.validUntil ?? null }
        : { grant: null };
    },

    [SHARE_GRANT]: async (_t, args) => {
      const friend = addressOf(args.friend);
      const a = await agent();
      const out = await a.run<Record<string, unknown>>(
        [
          {
            toolId: "library.grant.issue",
            args: {
              folder: folderFor(friend),
              delegate: friend,
              validDays: GRANT_DAYS,
            },
          },
        ],
        "let my friend read what I share with them in Seed Bible",
        { parkedOk: true }
      );
      return out.result;
    },

    [SHARE_NOTIFY]: async (_t, args) => {
      const friend = addressOf(args.friend);
      const message = String(args.message ?? "")
        .trim()
        .slice(0, 1000);
      if (!message) throw new WireRefusal(400, "message is what to send");
      const a = await agent();
      const out = await a.run<Record<string, unknown>>(
        [
          {
            toolId: "messaging.direct.send",
            args: { recipient: friend, message },
          },
        ],
        "tell my friend I shared something with them in Seed Bible",
        { parkedOk: true }
      );
      return out.result;
    },

    [SHARE_FETCH]: async (_t, args) => {
      const publisher = addressOf(args.publisher, "publisher");
      const id = String(args.id ?? "").trim();
      if (!id) throw new WireRefusal(400, "id names the shelf");
      if (!args.grant || typeof args.grant !== "object")
        throw new WireRefusal(400, "grant is the signed grant you were given");
      const a = await agent();
      const out = await a.run<GrantedFetch>(
        [
          {
            toolId: "library.granted.fetch",
            args: { publisher, id, grant: args.grant },
          },
        ],
        "read what my friend shared with me"
      );
      if (!out.result.read)
        throw new WireRefusal(
          403,
          out.result.refused ?? "that shelf is not readable under this grant"
        );
      return { shelf: parseShelf(out.result.text ?? "", publisher, a.reader) };
    },
  };
}
