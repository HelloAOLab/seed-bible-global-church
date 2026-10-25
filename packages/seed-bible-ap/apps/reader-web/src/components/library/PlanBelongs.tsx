// THIS READING BELONGS TO — the old reader's ReadingPlansSection, at the end of a chapter that is in one of your
// started plans: "Reading Plans", each plan with its tick (a tap toggles it), and "Mark John 3 as read". Reaching the
// card after a real read (twelve seconds on the chapter, the card well in view) raises "Nice reading! Mark John 3
// complete?" — Mark as complete, Not now. Marking ticks every reading of this chapter in those plans.
import { useEffect, useRef, useState } from "preact/hooks";
import { createPortal } from "preact/compat";
import type { ReaderState } from "../../state";
import type { Reading } from "../../state/reading/reading";
import { useI18n } from "../../i18n";
import {
  plansOnChapter,
  type PlanMatch,
} from "../../state/library/planMatches";

/** A fling to the bottom is not a read: the chapter has to have been open this long. */
const MIN_DWELL_MS = 12_000;

export function PlanBelongs({
  state,
  reading,
}: {
  state: ReaderState;
  reading: Reading;
}) {
  const { t } = useI18n();
  const chapterRef = reading.chapterRef.value;
  const matches = plansOnChapter(state.plans.views.value, chapterRef);
  const card = useRef<HTMLDivElement>(null);
  const [reached, setReached] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const count = matches.length;

  useEffect(() => {
    setReached(false);
    setDismissed(false);
    const el = card.current;
    if (!count || !el || typeof IntersectionObserver === "undefined") return;
    const openedAt = Date.now();
    let timer: number | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          timer = window.setTimeout(
            () => setReached(true),
            Math.max(0, MIN_DWELL_MS - (Date.now() - openedAt))
          );
        } else if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [chapterRef, count]);

  if (!count) return null;
  const set = async (m: PlanMatch, done: boolean) => {
    for (const r of m.readings)
      if (r.done !== done)
        await state.plans.setDone(m.planId, r.sessionId, r.readingId, done);
  };
  const markAll = async () => {
    for (const m of matches) if (!m.allComplete) await set(m, true);
  };
  const incomplete = matches.some((m) => !m.allComplete);
  const nudging = reached && incomplete;
  const passage = `${reading.bookName.value} ${reading.chapterNumber.value}`;
  return (
    <>
      {nudging &&
        !dismissed &&
        // At the top of the page: inside the reader it would sit under the Discover card beside the chapter.
        createPortal(
          <div className="sb-rpb-toast" role="status" aria-live="polite">
            <span className="sb-rpb-toast-icon" aria-hidden="true">
              <span className="material-symbols-outlined">menu_book</span>
            </span>
            <div className="sb-rpb-toast-text">
              <span className="sb-rpb-toast-title">
                {t("reading-plan-read-nudge-title", {
                  defaultValue: "Nice reading!",
                })}
              </span>
              <span className="sb-rpb-toast-sub">
                {t("reading-plan-read-nudge-toast", {
                  defaultValue: "Mark {{passage}} complete?",
                  passage,
                })}
              </span>
              <div className="sb-rpb-toast-actions">
                <button
                  type="button"
                  className="sb-rpb-toast-primary"
                  onClick={() => {
                    setDismissed(true);
                    void markAll();
                  }}
                >
                  {t("reading-plan-mark-complete", {
                    defaultValue: "Mark as complete",
                  })}
                </button>
                <button
                  type="button"
                  className="sb-rpb-toast-later"
                  onClick={() => setDismissed(true)}
                >
                  {t("reading-plan-nudge-later", { defaultValue: "Not now" })}
                </button>
              </div>
            </div>
            <button
              type="button"
              className="sb-rpb-toast-close"
              aria-label={t("dismiss", { defaultValue: "Dismiss" })}
              onClick={() => setDismissed(true)}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>,
          document.body
        )}
      <div
        ref={card}
        className={`sb-rpb-card${nudging ? " sb-rpb-card-nudge" : ""}`}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <h3 className="sb-discover-section-title">
          {t("reading-plans", { defaultValue: "Reading Plans" })}
        </h3>
        <ul className="sb-rpb-list">
          {matches.map((m) => (
            <li key={m.planId} className="sb-rpb-item">
              <button
                type="button"
                className="sb-rpb-row"
                aria-pressed={m.allComplete}
                onClick={() => void set(m, !m.allComplete)}
              >
                <span className="sb-rpb-plan-name" dir="auto">
                  {m.title}
                </span>
                <span
                  className={`sb-rpb-check${m.allComplete ? " sb-rpb-check-done" : ""}`}
                  aria-hidden="true"
                >
                  <span className="material-symbols-outlined">
                    {m.allComplete ? "check_circle" : "radio_button_unchecked"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {incomplete && (
          <button
            type="button"
            className={`sb-rpb-mark${nudging ? " sb-rpb-mark-nudge" : ""}`}
            onClick={() => void markAll()}
          >
            <span className="material-symbols-outlined">check</span>
            {t("reading-plan-mark-passage-complete", {
              defaultValue: "Mark {{passage}} as read",
              passage,
            })}
          </button>
        )}
      </div>
    </>
  );
}
