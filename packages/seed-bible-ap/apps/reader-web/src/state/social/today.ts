// TODAY — ported in outline from packages/seed-bible TodayManager (docs/porting/TodayManager.md): where to resume,
// your recent bookmarks and saves, and what your friends released (their public slices through the registry —
// hard-problems §4 layer 1; fan-in by owner, never a read of their Libraries). Friends are the Home's friends —
// mutual contacts (`person.friend.list`) — with the plain contacts as the stand-in where the agent lacks that read.
import { computed, signal } from "@preact/signals";
import type {
  Friend,
  FriendsView,
  ReaderBackend,
} from "../../backend/ReaderBackend";
import type { FriendProfile } from "./profile";
import type { ReaderStores } from "../../backend/offline/db";
import type { Offering } from "./discover";

export interface Contact {
  contact: string;
  name: string | null;
  role?: string;
  status?: string;
  mutual?: boolean;
  since?: string;
}

const KEY = "contacts";
const FRIENDS_KEY = "friends";

const toContact = (f: Friend): Contact => ({
  contact: f.agent,
  name: f.name,
  role: "friend",
  mutual: true,
  ...(f.since ? { since: f.since } : {}),
});

export function createToday(backend: ReaderBackend, stores: ReaderStores) {
  const contacts = signal<Contact[]>([]);
  const contactsError = signal<string | null>(null);
  const contactsLoading = signal(false);
  /** The Home's friends view; null until read (or when the agent has no friends read — contacts stand in). */
  const friendsView = signal<FriendsView | null>(null);
  const feed = signal<Offering[]>([]);
  const feedError = signal<string | null>(null);
  const feedLoading = signal(false);
  const loadedFor = signal<string | null>(null);

  void stores.prefs.get(KEY).then((v) => {
    if (Array.isArray(v)) contacts.value = v as Contact[];
  });
  void stores.prefs.get(FRIENDS_KEY).then((v) => {
    if (v && typeof v === "object" && Array.isArray((v as FriendsView).friends))
      friendsView.value = v as FriendsView;
  });

  /** Who the feed follows: the mutual friends when the Home answers that read, else every contact. */
  const friends = computed<Contact[]>(() =>
    friendsView.value
      ? friendsView.value.friends.map(toContact)
      : contacts.value.filter((c) => (c.status ?? "active") !== "removed")
  );
  /** People who added the reader and are waiting to be added back (empty on the contacts stand-in). */
  const requests = computed<Friend[]>(() => friendsView.value?.requests ?? []);
  /** People the reader added who have not added them back. */
  const requested = computed<Friend[]>(
    () => friendsView.value?.requested ?? []
  );
  /** Friends' published profiles (kind profile in their recent releases), by agent address. */
  const profiles = computed<Record<string, FriendProfile>>(() => {
    const out: Record<string, FriendProfile> = {};
    for (const o of feed.value) {
      if (o.kind !== "profile") continue;
      const w = (o.descriptor as { work?: FriendProfile }).work ?? {};
      const key = o.owner.toLowerCase();
      if (!out[key])
        out[key] = {
          ...(w.displayName ? { displayName: w.displayName } : {}),
          ...(w.about ? { about: w.about } : {}),
          ...(w.picture ? { picture: w.picture } : {}),
        };
    }
    return out;
  });
  /** What friends released, profiles aside (those are shown with the friend, not as releases). */
  const releases = computed(() =>
    feed.value.filter((o) => o.kind !== "profile")
  );

  async function refreshContacts() {
    if (!backend.identity()) {
      contacts.value = [];
      return;
    }
    contactsLoading.value = true;
    contactsError.value = null;
    try {
      // The friends read first. The contacts read is only the stand-in for an agent without it (an older playbook):
      // a Home that has friends has no contacts read any more (2026-10-26: person.contact.list now answers as the
      // friends read, with no contacts in it), so it is not asked when the friends read answered.
      try {
        friendsView.value = await backend.friends();
        await stores.prefs.set(FRIENDS_KEY, friendsView.value);
        return;
      } catch {
        friendsView.value = null;
      }
      contacts.value = await backend.contacts();
      await stores.prefs.set(KEY, contacts.value);
    } catch (e) {
      contactsError.value = e instanceof Error ? e.message : String(e);
    } finally {
      contactsLoading.value = false;
    }
  }

  /** The friends' recent public slices, newest first. */
  async function refreshFeed() {
    const owners = friends.value.map((c) => c.contact);
    if (!owners.length) {
      feed.value = [];
      return;
    }
    feedLoading.value = true;
    feedError.value = null;
    try {
      feed.value = await backend.discover({ owners });
      loadedFor.value = new Date().toISOString();
    } catch (e) {
      feedError.value = e instanceof Error ? e.message : String(e);
    } finally {
      feedLoading.value = false;
    }
  }

  async function refresh() {
    await refreshContacts();
    await refreshFeed();
  }

  return {
    contacts,
    friends,
    friendsView,
    requests,
    requested,
    profiles,
    releases,
    contactsError,
    contactsLoading,
    feed,
    feedError,
    feedLoading,
    loadedFor,
    refresh,
    refreshContacts,
    refreshFeed,
  };
}

export type Today = ReturnType<typeof createToday>;
