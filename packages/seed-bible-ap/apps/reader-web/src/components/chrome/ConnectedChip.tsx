// WHO YOU ARE, AS A PICTURE — the reader's avatar: their profile's picture, else the initial of their name. The
// sidebar's profile circle, the phone's account button and Account settings carry it.
import type { ReaderState } from "../../state";

export function Avatar({
  state,
  size = "s",
}: {
  state: ReaderState;
  size?: "s" | "m";
}) {
  const s = state.session.value;
  const picture = state.profile.mine.value?.picture;
  const name = state.profile.mine.value?.displayName || s?.name || "";
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
