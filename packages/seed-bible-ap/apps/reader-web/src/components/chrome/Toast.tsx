// A short line at the foot of the screen that goes by itself (state `ui.toast`): "Signed in as Ruth".
import { useEffect } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

const SHOWN_MS = 3500;

/** Every line a toast can say, by its key; an unknown key is shown as it is. */
function line(
  t: ReturnType<typeof useI18n>["t"],
  key: string,
  values: Record<string, string>
): string {
  switch (key) {
    case "signed-in-as":
      return t("signed-in-as", {
        defaultValue: "Signed in as {{name}}",
        name: values["name"] ?? "",
      });
    case "translation-downloaded":
      return t("translation-downloaded", {
        defaultValue: "{{name}} is now available offline",
        name: values["name"] ?? "",
      });
    case "added-to-reading-plan-session":
      return t("added-to-reading-plan-session", {
        defaultValue: "Added to session {{session}}",
        session: values["session"] ?? "",
      });
    case "playlist-url-copied":
      return t("playlist-url-copied", { defaultValue: "Playlist URL copied" });
    case "plan-url-copied":
      return t("plan-url-copied", { defaultValue: "Reading plan URL copied" });
    case "session-connection-lost":
      return t("session-connection-lost", {
        defaultValue: "You lost connection to the session. Reconnecting…",
      });
    case "session-rejoined":
      return t("session-rejoined", {
        defaultValue: "You rejoined the session",
      });
    case "session-host-disconnected":
      return t("session-host-disconnected", {
        defaultValue: "The host disconnected",
      });
    case "session-host-reconnected":
      return t("session-host-reconnected", {
        defaultValue: "The host reconnected",
      });
    case "signed-out-message":
      return t("signed-out-message", {
        defaultValue: "You've been signed out. Please sign in again.",
      });
    case "annotation-saved":
      return t("annotation-saved", { defaultValue: "Annotation saved" });
    case "annotation-save-failed":
      return t("annotation-save-failed", {
        defaultValue: "Couldn't save the annotation.",
      });
    case "annotation-delete-failed":
      return t("delete-annotation-failed", {
        defaultValue: "Couldn't delete the annotation.",
      });
    case "link-copied":
      return t("link-copied", { defaultValue: "Link copied" });
    case "copied":
      return t("copied", { defaultValue: "Copied" });
    case "session-link-copied":
      return t("link-to-join-shared-session-copied", {
        defaultValue:
          "A link to join the shared session was copied to your clipboard",
      });
    case "copied-translation-share-link":
      return t("copied-translation-share-link", {
        defaultValue: "Copied translation share link",
      });
    case "translation-removed-from-device":
      return t("translation-removed-from-device", {
        defaultValue: "{{name}} was removed from this device",
        name: values["name"] ?? "",
      });
    case "translation-download-failed":
      return t("translation-download-failed", {
        defaultValue:
          "Couldn't download {{name}}. Tap its download button to try again.",
        name: values["name"] ?? "",
      });
    default:
      return key;
  }
}

export function Toast({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const toast = state.ui.toast.value;
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => (state.ui.toast.value = null), SHOWN_MS);
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="sb-toast" role="status">
      {line(t, toast.key, toast.values ?? {})}
    </div>
  );
}
