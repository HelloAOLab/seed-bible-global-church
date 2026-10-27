// FROM YOUR FRIENDS — the old reader's "Playlists from your friends" and "Reading plans from your friends": what each
// friend released (their recent public slices, today.releases), grouped by friend; a tap opens it as its shared page,
// whose Save to my Library and play / start does the rest. Only what a friend chose to publish is here.
import { useEffect } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { sharedRefOf } from "../../state/social/sharedPage";

type Kind = "playlist" | "plan" | "customization";

export function FromFriends({
  state,
  kinds,
  heading,
}: {
  state: ReaderState;
  kinds: Kind[];
  heading: string;
}) {
  const { t } = useI18n();
  const today = state.today;
  const signedIn = !!state.session.value;
  // opened before Today ever was: friends' releases are read now
  useEffect(() => {
    if (signedIn && !today.loadedFor.value) void today.refresh();
  }, [signedIn]);
  if (!signedIn) return null;
  const friends = new Set(
    today.friends.value.map((f) => f.contact.toLowerCase())
  );
  const items = today.releases.value.filter(
    (o) =>
      (kinds as string[]).includes(o.kind) &&
      friends.has((o.owner || o.shelf).toLowerCase())
  );
  if (!items.length) return null;
  const nameOf = (agent: string) =>
    today.profiles.value[agent]?.displayName ??
    today.friends.value.find((f) => f.contact.toLowerCase() === agent)?.name ??
    agent.slice(0, 8);
  const byFriend = new Map<string, typeof items>();
  for (const o of items) {
    const who = (o.owner || o.shelf).toLowerCase();
    byFriend.set(who, [...(byFriend.get(who) ?? []), o]);
  }
  const icon: Record<string, string> = {
    playlist: "queue_music",
    plan: "event_note",
    customization: "palette",
  };
  return (
    <section className="sb-from-friends" data-testid="from-friends">
      <h3 className="sb-from-friends-heading">{heading}</h3>
      {[...byFriend].map(([who, list]) => (
        <div key={who} className="sb-from-friends-group">
          <p className="sb-small sb-muted sb-from-friends-who">{nameOf(who)}</p>
          <ul className="sb-from-friends-list">
            {list.map((o) => {
              const ref = sharedRefOf(o);
              return (
                <li key={o.descriptorId}>
                  <button
                    type="button"
                    className="sb-from-friends-item"
                    disabled={!ref}
                    onClick={() => {
                      if (ref) state.ui.shared.value = ref;
                    }}
                    aria-label={t("open-from-friend", {
                      title: o.title,
                      name: nameOf(who),
                      defaultValue: "Open {{title}} from {{name}}",
                    })}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      {icon[o.kind] ?? "share"}
                    </span>
                    <span className="sb-from-friends-title">{o.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
