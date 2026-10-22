// THE READER'S PROFILE — ported in role from the old profile config: a display name, a line about you, a picture
// from your gallery, kept as one `seed:Profile` work in your Library (`seed-bible/profile/profile.jsonld`, private),
// and published to your public shelf as an offering of kind `profile` when you choose — which is how friends see
// your picture and line in their Today (through the registry, like any released slice).
import { computed } from "@preact/signals";
import { Profile } from "@seed/seed-schema";
import type {
  ReaderBackend,
  ReaderIdentity,
} from "../../backend/ReaderBackend";
import type { ReaderStores } from "../../backend/offline/db";
import { LOCAL_AGENT } from "../records/buckets";
import { nowIso } from "../records/marks";
import { createWorks } from "../library/works";

export const PROFILE_FOLDER = "seed-bible/profile" as const;

export function createProfile(
  backend: ReaderBackend,
  stores: ReaderStores,
  identity: () => ReaderIdentity | null
) {
  const works = createWorks<Profile>(PROFILE_FOLDER, backend, stores, (raw) =>
    Profile.parse(raw)
  );
  const idOf = () =>
    `urn:seed:profile:${(identity()?.agent ?? LOCAL_AGENT).toLowerCase()}`;
  /** The reader's own profile, or null until one is saved. */
  const mine = computed<Profile | null>(
    () =>
      works.live().find((p) => p["@id"] === idOf()) ?? works.live()[0] ?? null
  );

  async function save(patch: {
    displayName?: string;
    about?: string;
    picture?: string | null;
  }): Promise<Profile> {
    const cur = mine.value;
    const next: Profile = {
      "@id": cur?.["@id"] ?? idOf(),
      "@type": "seed:Profile",
      heldBy: identity()?.agent ?? LOCAL_AGENT,
      label: cur?.displayName ?? "Profile",
      ...(cur?.displayName ? { displayName: cur.displayName } : {}),
      ...(cur?.about ? { about: cur.about } : {}),
      ...(cur?.picture ? { picture: cur.picture } : {}),
      createdAt: cur?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    if (patch.displayName !== undefined) {
      if (patch.displayName.trim()) next.displayName = patch.displayName.trim();
      else delete next.displayName;
    }
    if (patch.about !== undefined) {
      if (patch.about.trim()) next.about = patch.about.trim();
      else delete next.about;
    }
    if (patch.picture !== undefined) {
      if (patch.picture) next.picture = patch.picture;
      else delete next.picture;
    }
    next.label = next.displayName ?? "Profile";
    await works.save(next);
    return next;
  }

  return { ...works, mine, save };
}

export type ProfileState = ReturnType<typeof createProfile>;

/** A friend's published profile, as the registry carries it. */
export interface FriendProfile {
  displayName?: string;
  about?: string;
  picture?: string;
}
