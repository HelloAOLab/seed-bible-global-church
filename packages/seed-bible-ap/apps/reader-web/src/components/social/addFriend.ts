// ADD A FRIEND — one box, a name or an email. A name is a friend request (the old reader's instant answers first:
// your own account, already friends, already asked; then the Home's signature). An email is an invitation the Home
// mails; it reaches them whether or not they're here yet, and their link brings them back to this reader.
import type { ReaderState } from "../../state";
import type { useI18n } from "../../i18n";
import { standingOf } from "../../state/social/friendship";
import { isEmail } from "../../state/social/invites";

type T = ReturnType<typeof useI18n>["t"];

/** Act on what was typed; the line to show under the box, or null when the Home's window says it instead. */
export async function addFriendOrInvite(
  state: ReaderState,
  typed: string,
  t: T
): Promise<string | null> {
  const name = typed.trim();
  if (!name) return null;
  const me = state.session.value;
  if (isEmail(name)) {
    const myName = state.profile.mine.value?.displayName || me?.name || null;
    const r = await state.invites.send(name, myName);
    if (!r.ok)
      return t("friend-invite-failed", {
        error: r.error ?? "",
        defaultValue: "Couldn't send the invitation: {{error}}",
      });
    return r.again
      ? t("friend-invite-sent-again", {
          email: name,
          defaultValue: "Sent your invitation to {{email}} again.",
        })
      : t("friend-invite-sent", {
          email: name,
          defaultValue:
            "Invitation sent to {{email}}. When they join, you'll be friends.",
        });
  }
  const own =
    !!me &&
    [me.sub.replace(/^eip155:\d+:/, ""), me.name ?? ""]
      .filter(Boolean)
      .map((x) => x.toLowerCase().replace(/\s+/g, ""))
      .some((x) => {
        const n = name.toLowerCase().replace(/\s+/g, "");
        return x === n || x.split(".")[0] === n.split(".")[0];
      });
  const standing = standingOf(state.today.friendsView.value, name);
  if (own)
    return t("friend-request-self", {
      defaultValue: "That's your own account.",
    });
  if (standing === "friend")
    return t("friend-already-friends", {
      defaultValue: "You're already friends.",
    });
  if (standing === "you-asked")
    return t("friend-request-already-sent", {
      defaultValue: "You've already sent them a request.",
    });
  state.friendship.add(name);
  return standing === "asked-you"
    ? t("friend-request-accepted-theirs", {
        defaultValue: "They'd already asked you, so you're now friends.",
      })
    : null;
}
