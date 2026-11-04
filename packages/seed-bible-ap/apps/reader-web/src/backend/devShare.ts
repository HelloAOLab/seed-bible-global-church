// SHARING IN THE DEV BACKEND — seed.share.* in memory, across every dev backend in the page (one per identity), so a
// test can share as one person and read as another: one shelf per (owner, friend), a grant issued at once unless the
// test asks for it to be parked for signing (`parkGrants`), and a read refused without the owner's grant to the reader.
import type { Parked, ShareBackend, SharedItem } from "../state/social/share";

interface Shelf {
  id: string;
  owner: string;
  friend: string;
  items: SharedItem[];
}
const WORLD = {
  shelves: new Map<string, Shelf>(),
  grants: new Map<string, { owner: string; friend: string; token: string }>(),
  messages: [] as Array<{ from: string; to: string; message: string }>,
};
/** Every dev share in the page, for a test to start clean or to read the messages sent. */
export const devShareWorld = WORLD;
export function resetDevShares() {
  WORLD.shelves.clear();
  WORLD.grants.clear();
  WORLD.messages.length = 0;
}

export interface DevShare extends ShareBackend {
  /** Park the grant and the message for signing (the Home), as the live agent does on a first share. */
  parkGrants: boolean;
  /** Sign every parked grant of this reader (what the Home's window does). */
  signParked(): void;
}

export function createDevShare(
  me: () => string | null,
  guard: () => void
): DevShare {
  const parked = new Set<string>();
  const key = (owner: string, friend: string) => `${owner}|${friend}`;
  const self = () => {
    guard();
    return me()!.toLowerCase();
  };
  return {
    parkGrants: false,
    async sharePut(friend, item) {
      const owner = self();
      const k = key(owner, friend);
      const shelf = WORLD.shelves.get(k) ?? {
        id: `shelf-${WORLD.shelves.size + 1}`,
        owner,
        friend,
        items: [],
      };
      const rest = shelf.items.filter((i) => i.key !== item.key);
      shelf.items =
        "remove" in item
          ? rest
          : [{ ...item, sharedAt: new Date().toISOString() }, ...rest];
      WORLD.shelves.set(k, shelf);
      return { shelf: shelf.id };
    },
    async shareGrants(friend) {
      const g = WORLD.grants.get(key(self(), friend));
      return {
        grant: g
          ? { token: g.token, delegator: g.owner, delegate: g.friend }
          : null,
      };
    },
    async shareGrant(friend): Promise<Parked | { grant: unknown }> {
      const owner = self();
      if (this.parkGrants) {
        parked.add(friend);
        return { parked: true, runRef: `run-grant-${friend.slice(2, 8)}` };
      }
      const token = `grant-${owner.slice(2, 6)}-${friend.slice(2, 6)}`;
      WORLD.grants.set(key(owner, friend), { owner, friend, token });
      return { grant: { token, delegator: owner, delegate: friend } };
    },
    signParked() {
      const owner = me()!.toLowerCase();
      for (const friend of parked) {
        const token = `grant-${owner.slice(2, 6)}-${friend.slice(2, 6)}`;
        WORLD.grants.set(key(owner, friend), { owner, friend, token });
      }
      parked.clear();
    },
    async shareNotify(friend, message): Promise<Parked | { sent: true }> {
      const from = self();
      WORLD.messages.push({ from, to: friend, message });
      return this.parkGrants
        ? { parked: true, runRef: `run-msg-${friend.slice(2, 8)}` }
        : { sent: true };
    },
    async shareFetch(publisher, id, grant) {
      const reader = self();
      const shelf = [...WORLD.shelves.values()].find(
        (s) => s.id === id && s.owner === publisher
      );
      const g = WORLD.grants.get(key(publisher, reader));
      const token = (grant as { token?: string } | null)?.token;
      if (!shelf || shelf.friend !== reader || !g || g.token !== token)
        throw new Error("That is not readable under this grant.");
      return { items: shelf.items };
    },
  };
}
