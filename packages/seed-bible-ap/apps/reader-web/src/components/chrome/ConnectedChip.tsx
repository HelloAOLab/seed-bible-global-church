// WHO YOU ARE, AS A PICTURE — the reader's avatar: their Home profile's photo (signed in), else the reader's own
// profile picture, else the initial of their name. The
// sidebar's profile circle, the phone's account button and Account settings carry it.
import type { ReaderState } from "../../state";
import { fullName } from "../../state/social/homeProfile";

export function Avatar({
  state,
  size = "s",
}: {
  state: ReaderState;
  size?: "s" | "m";
}) {
  const s = state.session.value;
  // Signed in, your Home profile's photo and name are yours here; the reader's own copy is the fallback.
  const home = s ? state.homeProfile.value.value : null;
  const picture = home?.photo ?? state.profile.mine.value?.picture;
  const name =
    fullName(home) || state.profile.mine.value?.displayName || s?.name || "";
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return picture ? (
    <img className={`sb-avatar sb-avatar-${size}`} src={picture} alt="" />
  ) : (
    <span
      className={`sb-avatar sb-avatar-${size} sb-avatar-initial`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
