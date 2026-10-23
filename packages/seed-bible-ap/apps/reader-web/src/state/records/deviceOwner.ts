// WHOSE COPY THIS DEVICE HOLDS. The device keeps a copy of the signed-in person's own things — their profile,
// playlists, plans, gallery, what they published, their friends — under keys that do not name them, because one
// person uses one device at a time. So the device remembers whose copy it is: signing out forgets that copy, and a
// different person signing in starts from an empty one (their Library refills it). Marks are not here: each mark
// names who holds it, and another person's are parked, never shown or sent as yours (records/buckets.ts).
// What stays is the device's own: settings, tabs, the toolbar, reading position, offline translations.
import type { KeyValueStore } from "../../backend/offline/db";

export const DEVICE_PERSON_KEY = "device:person";

/** The person's own copies on the device. */
const PERSONAL: RegExp[] = [
  /^works:/,
  /^published-notes$/,
  /^contacts$/,
  /^friends$/,
  /^friends:not-now$/,
  /^playlists:history$/,
  /^publish:as$/,
  /^presence:share$/,
  /^customization:selected:work$/,
];

export const isPersonal = (key: string): boolean =>
  PERSONAL.some((re) => re.test(key));

/** Drop the signed-in person's copies, and the record of whose they were. */
export async function forgetPerson(
  prefs: KeyValueStore<unknown>
): Promise<void> {
  const keys = await prefs.keys();
  await Promise.all(
    keys
      .filter((k) => isPersonal(k) || k === DEVICE_PERSON_KEY)
      .map((k) => prefs.delete(k))
  );
}

/**
 * `person` is signing in here. True when the device held someone else's copy — it is forgotten, and what is in
 * memory is theirs too, so the caller starts the page again.
 */
export async function claimDevice(
  prefs: KeyValueStore<unknown>,
  person: string
): Promise<boolean> {
  const me = person.toLowerCase();
  const before = (await prefs.get(DEVICE_PERSON_KEY)) as string | undefined;
  if (before && before !== me) {
    await forgetPerson(prefs);
    await prefs.set(DEVICE_PERSON_KEY, me);
    return true;
  }
  if (before !== me) await prefs.set(DEVICE_PERSON_KEY, me);
  return false;
}
