// TODAY — ported in outline from packages/seed-bible TodayManager (docs/porting/TodayManager.md): where to resume,
// your recent bookmarks and saves, and what your friends released (their public slices through the registry —
// hard-problems §4 layer 1; fan-in by owner, never a read of their Libraries). Friends are the Home's contacts.
import { computed, signal } from "@preact/signals";
import type { ReaderBackend } from "../../backend/ReaderBackend";
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

export function createToday(backend: ReaderBackend, stores: ReaderStores) {
  const contacts = signal<Contact[]>([]);
  const contactsError = signal<string | null>(null);
  const contactsLoading = signal(false);
  const feed = signal<Offering[]>([]);
  const feedError = signal<string | null>(null);
  const feedLoading = signal(false);
  const loadedFor = signal<string | null>(null);

  void stores.prefs.get(KEY).then((v) => {
    if (Array.isArray(v)) contacts.value = v as Contact[];
  });

  const friends = computed(() =>
    contacts.value.filter((c) => (c.status ?? "active") !== "removed")
  );

  async function refreshContacts() {
    if (!backend.identity()) {
      contacts.value = [];
      return;
    }
    contactsLoading.value = true;
    contactsError.value = null;
    try {
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
