// THE TOUR OVERLAY — the old Tutorial coachmark: the step's element spotlit (everything else dimmed), a card beside
// it with the step's title and text, its progress, Back / Next (Done on the last) and Skip — which asks whether to
// turn tutorials off or skip just this one. Modal while it shows; Escape skips (state/index.ts keys).
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findTarget(selector: string): HTMLElement | null {
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>(selector)
  )) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Each step's title and text, with literal keys so the translation-key test sees every one. */
function stepText(
  t: ReturnType<typeof useI18n>["t"],
  key: string,
  title: string,
  body: string
): [string, string] {
  switch (key) {
    case "tabs":
      return [
        t("tutorial.tabsTitle", { defaultValue: "Tabs and saves" }),
        t("tutorial.tabsBody", {
          defaultValue: "Your open passages and saves live here.",
        }),
      ];
    case "paneLayout":
      return [
        t("tutorial.paneLayoutTitle", { defaultValue: "Arrange your panes" }),
        t("tutorial.paneLayoutBody", {
          defaultValue:
            "Choose how many passages to read side by side from this layout menu.",
        }),
      ];
    case "addTab":
      return [
        t("tutorial.addTabTitle", { defaultValue: "Open more passages" }),
        t("tutorial.addTabBody", {
          defaultValue:
            "Add a new tab to read several books or translations side by side.",
        }),
      ];
    case "toolbar":
      return [
        t("tutorial.toolbarTitle", { defaultValue: "Toolbar" }),
        t("tutorial.toolbarBody", {
          defaultValue:
            "You can customize the toolbar to your liking. By default, book selection, navigation, and search are built in.",
        }),
      ];
    case "settings":
      return [
        t("tutorial.settingsTitle", { defaultValue: "Settings" }),
        t("tutorial.settingsBody", {
          defaultValue:
            "Customize themes, text, and more here, or install the app to your device.",
        }),
      ];
    case "mobileBooks":
      return [
        t("tutorial.mobileBooksTitle", {
          defaultValue: "Your book/chapter selection",
        }),
        t("tutorial.mobileBooksBody", {
          defaultValue:
            "Tap the book name to jump to a different book or chapter.",
        }),
      ];
    case "mobilePassage":
      return [
        t("tutorial.mobilePassageTitle", {
          defaultValue: "Your current translation",
        }),
        t("tutorial.mobilePassageBody", {
          defaultValue:
            "Tap the translation name to jump to a different translation.",
        }),
      ];
    case "mobileToolbar":
      return [
        t("tutorial.mobileToolbarTitle", { defaultValue: "Toolbar" }),
        t("tutorial.mobileToolbarBody", {
          defaultValue:
            "Switch between the Bible, search, and more from the bottom bar.",
        }),
      ];
    case "mobileSettings":
      return [
        t("tutorial.mobileSettingsTitle", { defaultValue: "Settings" }),
        t("tutorial.mobileSettingsBody", {
          defaultValue: "Customize text, themes, and reading options here.",
        }),
      ];
    case "selectorSearch":
      return [
        t("tutorial.selectorSearchTitle", { defaultValue: "Search by" }),
        t("tutorial.selectorSearchBody", {
          defaultValue: "Search by chapter, verse or book from here.",
        }),
      ];
    case "selectorBooks":
      return [
        t("tutorial.selectorBooksTitle", {
          defaultValue: "Select books and chapters",
        }),
        t("tutorial.selectorBooksBody", {
          defaultValue: "Choose a chapter from here to begin reading.",
        }),
      ];
    case "selectorTestament":
      return [
        t("tutorial.selectorTestamentTitle", {
          defaultValue: "Filter book options",
        }),
        t("tutorial.selectorTestamentBody", {
          defaultValue:
            "Show all books, or narrow to just the Old Testament, New Testament, or extra-biblical writings.",
        }),
      ];
    case "offlineDownload":
      return [
        t("tutorial.offlineDownloadTitle", {
          defaultValue: "Tap to keep it on your device",
        }),
        t("tutorial.offlineDownloadBody", {
          defaultValue:
            "Any translation with this icon can be saved for offline reading.",
        }),
      ];
    default:
      return [title, body];
  }
}

export function Tour({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { tours } = state;
  const step = tours.current.value;
  const active = tours.active.value;
  const [box, setBox] = useState<Box | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setAsking(false);
    if (!step) return;
    // The element may appear a moment later (a pane opening): look again until it is there, and follow it.
    const measure = () => {
      const el = findTarget(step.target);
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const id = setInterval(measure, 300);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step?.id, active?.id]);

  if (!step || !active) return null;
  const total = tours.steps.value.length;
  const text = stepText(
    t,
    step.titleKey.replace(/^tutorial\.|Title$/g, ""),
    step.title,
    step.body
  );
  const last = active.index === total - 1;
  const pad = 6;
  const cardWidth = Math.min(320, window.innerWidth - 32);
  // Below the element when there is room, else above; centred when the element is not on screen.
  const card = box
    ? (() => {
        const below = box.top + box.height + pad + 12;
        const room = window.innerHeight - below;
        const top = room > 180 ? below : Math.max(16, box.top - pad - 12 - 180);
        const left = Math.min(
          Math.max(16, box.left + box.width / 2 - cardWidth / 2),
          window.innerWidth - cardWidth - 16
        );
        return { top, left };
      })()
    : {
        top: window.innerHeight / 2 - 90,
        left: window.innerWidth / 2 - cardWidth / 2,
      };

  return (
    <div
      className="sb-tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sb-tour-title"
    >
      {box ? (
        <div
          className="sb-tour-spot"
          style={{
            top: `${box.top - pad}px`,
            left: `${box.left - pad}px`,
            width: `${box.width + pad * 2}px`,
            height: `${box.height + pad * 2}px`,
          }}
        />
      ) : (
        <div className="sb-tour-dim" />
      )}
      <div
        className="sb-tour-card"
        style={{
          top: `${card.top}px`,
          left: `${card.left}px`,
          width: `${cardWidth}px`,
        }}
      >
        {asking ? (
          <>
            <h3 id="sb-tour-title">
              {t("tutorial.skipPromptTitle", {
                defaultValue: "Turn off tutorials?",
              })}
            </h3>
            <p className="sb-small">
              {t("tutorial.skipPromptBody", {
                defaultValue:
                  "You can turn tutorials back on later from Settings. Would you like to stop seeing them, or just skip this one?",
              })}
            </p>
            <div className="sb-tour-actions">
              <button
                className="sb-note-button"
                onClick={() => tours.skip(false)}
              >
                {t("tutorial.skipPromptKeep", {
                  defaultValue: "Just this one",
                })}
              </button>
              <button
                className="sb-note-button sb-note-button-primary"
                onClick={() => tours.skip(true)}
              >
                {t("tutorial.skipPromptDisable", {
                  defaultValue: "Turn off tutorials",
                })}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="sb-small sb-muted">
              {t("tutorial.stepProgress", {
                current: active.index + 1,
                total,
                defaultValue: "Step {{current}} of {{total}}",
              })}
            </p>
            <h3 id="sb-tour-title">{text[0]}</h3>
            <p className="sb-small">{text[1]}</p>
            <div className="sb-tour-actions">
              <button
                className="sb-note-button sb-tour-skip"
                onClick={() => setAsking(true)}
              >
                {t("tutorial.skip", { defaultValue: "Skip" })}
              </button>
              <span className="sb-tour-spacer" />
              {active.index > 0 && (
                <button className="sb-note-button" onClick={() => tours.back()}>
                  {t("tutorial.back", { defaultValue: "Back" })}
                </button>
              )}
              <button
                className="sb-note-button sb-note-button-primary"
                onClick={() => tours.next()}
              >
                {last
                  ? t("tutorial.done", { defaultValue: "Done" })
                  : t("tutorial.next", { defaultValue: "Next" })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
