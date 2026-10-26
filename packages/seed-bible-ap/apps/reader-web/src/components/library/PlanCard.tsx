// A READING PLAN — the old reader's plan card and plan screen (packages/seed-bible components/ReadingPlansPane):
// closed, its cover, title, description, "10 days · started 20 Oct", the progress bar, a streak or how many days
// behind, and "Next: Day 3 · John 3"; open, the same with the end date and "~4 min/day", a strip of days, the day's
// readings to tick (a tap opens one), its Reflect note, Read (the day's readings in turn, then "Nice reading! Mark Day
// N complete?"), and Mark Day N complete ("Day N complete!", "Plan complete!"). Below: Publish, Share plan, Edit,
// Restart, the cover, Delete (asked first).
import { useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { PlanView } from "../../state/library/plans";
import { planSummary, readingMinutes } from "../../state/library/planSummary";
import { itemLabel, openItem } from "./LibraryPane";
import { PictureField } from "./PictureField";
import { COVER_IMAGE } from "../../state/library/crop";
import { sharedLinkOf } from "../../state/social/sharedPage";

type Translate = ReturnType<typeof useI18n>["t"];

const shortDate = (d: Date, language: string) =>
  new Intl.DateTimeFormat(language, { month: "short", day: "numeric" }).format(
    d
  );

function dayWord(t: Translate, selfPaced: boolean, n: number) {
  return selfPaced
    ? t("reading-plan-session-n", { defaultValue: "Session {{day}}", day: n })
    : t("reading-plan-day-n", { defaultValue: "Day {{day}}", day: n });
}

export function PlanCard(props: {
  state: ReaderState;
  view: PlanView;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { state, view, open } = props;
  const { t, language } = useI18n();
  const { plans } = state;
  const pl = view.plan;
  const books = state.reading.books.value;
  const bookLength = (id: string) => books.find((b) => b.id === id) ?? null;
  const sum = planSummary(pl, view.progress, Date.now(), bookLength);
  const [chosenDay, setChosenDay] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const published = state.publishing.isPublished(pl["@id"]);
  const canPublish = !!state.session.value?.wire;
  const total = sum.days.length;
  const percent = total ? Math.round((100 * sum.doneDays) / total) : 0;
  const readingsOf = (i: number) =>
    pl.hasSession[i]?.readings.map((r) => r.item) ?? [];
  const nextLabel = sum.next
    ? readingsOf(sum.next.index)
        .map((it) => itemLabel(state, it))
        .join(", ")
    : "";
  const sub = [
    sum.selfPaced
      ? t("reading-plan-session-count-sessions", {
          defaultValue: "{{count}} sessions",
          count: total,
        })
      : t("reading-plan-duration-days", {
          defaultValue: "{{count}} days",
          count: total,
        }),
    ...(sum.startedAt
      ? [
          t("reading-plan-started-on", {
            defaultValue: "started {{date}}",
            date: shortDate(sum.startedAt, language),
          }),
        ]
      : []),
  ].join(" · ");

  const card = (
    <>
      <div className="sb-rp-card-row">
        <button
          type="button"
          className="sb-rp-card-open"
          aria-expanded={open}
          onClick={props.onToggle}
        >
          {pl.heroImage && (
            <img className="sb-hero-thumb" src={pl.heroImage} alt="" />
          )}
          <span className="sb-rp-card-body">
            <span className="sb-rp-card-title" dir="auto">
              {pl.label}
            </span>
            {pl.description && (
              <span className="sb-rp-card-sub" dir="auto">
                {pl.description}
              </span>
            )}
            <span className="sb-rp-card-sub">{sub}</span>
          </span>
        </button>
        <span className="material-symbols-outlined sb-rp-card-chevron">
          {open ? "expand_less" : "arrow_forward"}
        </span>
      </div>
      <div className="sb-rp-card-progress">
        <span className="sb-rp-card-progress-bar">
          <span
            className="sb-rp-card-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </span>
        <span className="sb-rp-card-progress-label">
          {sum.doneDays}/{total}
        </span>
      </div>
      {view.progress && (
        <div className="sb-rp-card-footer">
          {!sum.selfPaced && sum.behind > 0 ? (
            <span className="sb-rp-chip sb-rp-chip-warn">
              <span className="material-symbols-outlined">warning</span>
              {t("reading-plan-days-behind", {
                defaultValue: "{{count}} days behind",
                count: sum.behind,
              })}
            </span>
          ) : !sum.selfPaced && sum.streak > 0 ? (
            <span className="sb-rp-chip sb-rp-chip-streak">
              🔥{" "}
              {t("reading-plan-streak", {
                defaultValue: "{{count}}-day streak",
                count: sum.streak,
              })}
            </span>
          ) : (
            <span />
          )}
          {sum.next && (
            <span className="sb-rp-card-next">
              {sum.selfPaced
                ? t("reading-plan-next-session", {
                    defaultValue: "Next: Session {{day}} · {{readings}}",
                    day: sum.next.index + 1,
                    readings: nextLabel,
                  })
                : t("reading-plan-next", {
                    defaultValue: "Next: Day {{day}} · {{readings}}",
                    day: sum.next.index + 1,
                    readings: nextLabel,
                  })}
            </span>
          )}
        </div>
      )}
    </>
  );

  if (!open)
    return (
      <article
        className="sb-rp-card sb-rp-card-lg sb-rp-card-static sb-note-card"
        data-plan-id={pl["@id"]}
      >
        {card}
      </article>
    );

  const activeIndex = chosenDay ?? sum.today?.index ?? sum.next?.index ?? 0;
  const session = pl.hasSession[activeIndex];
  const sp = view.progress?.sessions.find(
    (x) => x.session === session?.["@id"]
  );
  const isDone = (rid: string) => !!sp?.completed.includes(rid);
  const allDone =
    !!session &&
    session.readings.length > 0 &&
    session.readings.every((r) => isDone(r["@id"]));
  const completeDay = async (index: number) => {
    const s = pl.hasSession[index];
    if (!s) return;
    await plans.completeSession(pl["@id"], s["@id"]);
    setCelebrate(index + 1);
  };
  const readDay = () => {
    if (!session) return;
    const items = session.readings.map((r) => r.item);
    const first = session.readings.findIndex((r) => !isDone(r["@id"]));
    const day = activeIndex + 1;
    state.ui.pane.value = "none";
    state.playlists.playItems(
      `${pl.label} · ${dayWord(t, sum.selfPaced, day)}`,
      items,
      first < 0 ? 0 : first,
      () =>
        (state.ui.planNudge.value = {
          planId: pl["@id"],
          sessionId: session["@id"],
          label: dayWord(t, sum.selfPaced, day),
        })
    );
  };
  const share = async () => {
    const link = await sharedLinkOf(
      state.publishing,
      state.discover,
      pl["@id"],
      location.origin
    );
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      state.ui.toast.value = { key: "plan-url-copied" };
    } catch {
      /* the clipboard refused */
    }
  };
  const complete = sum.doneDays === total && total > 0;

  if (celebrate !== null)
    return (
      <article
        className="sb-rp-card sb-rp-card-lg sb-rp-card-static sb-note-card"
        data-plan-id={pl["@id"]}
      >
        <div className="sb-rpd">
          <div className="sb-rpd-celebration">
            <div className="sb-rpd-celebration-badge" aria-hidden="true">
              <span className="material-symbols-outlined">check</span>
            </div>
            <h3 className="sb-rpd-celebration-title">
              {complete
                ? t("reading-plan-complete-title", {
                    defaultValue: "Plan complete!",
                  })
                : sum.selfPaced
                  ? t("reading-plan-celebration-session-title", {
                      defaultValue: "Session {{day}} complete!",
                      day: celebrate,
                    })
                  : t("reading-plan-celebration-title", {
                      defaultValue: "Day {{day}} complete!",
                      day: celebrate,
                    })}
            </h3>
            <p className="sb-rpd-celebration-subtitle">
              {t("reading-plan-celebration-subtitle", {
                defaultValue: "Great work. Keep the momentum going.",
              })}
            </p>
            <button
              type="button"
              className="sb-note-button sb-note-button-primary"
              onClick={() => setCelebrate(null)}
            >
              {t("reading-plan-back-to-plan", { defaultValue: "Back to plan" })}
            </button>
          </div>
        </div>
      </article>
    );

  return (
    <article
      className="sb-rp-card sb-rp-card-lg sb-rp-card-static sb-note-card"
      data-plan-id={pl["@id"]}
    >
      {card}
      <div className="sb-rpd">
        {view.progress && (
          <header className="sb-rpd-hero-header">
            {!sum.selfPaced && sum.endsAt && (
              <p className="sb-rpd-subtitle">
                {t("reading-plan-ends-on", {
                  defaultValue: "ends {{date}}",
                  date: shortDate(sum.endsAt, language),
                })}
              </p>
            )}
            <div className="sb-rpd-chips">
              {!sum.selfPaced && sum.streak > 0 && (
                <span className="sb-rpd-chip">
                  🔥{" "}
                  {t("reading-plan-streak", {
                    defaultValue: "{{count}}-day streak",
                    count: sum.streak,
                  })}
                </span>
              )}
              {sum.minutesPerDay > 0 && (
                <span className="sb-rpd-chip">
                  {sum.selfPaced
                    ? t("reading-plan-min-per-session", {
                        defaultValue: "~{{count}} min/session",
                        count: sum.minutesPerDay,
                      })
                    : t("reading-plan-min-per-day", {
                        defaultValue: "~{{count}} min/day",
                        count: sum.minutesPerDay,
                      })}
                </span>
              )}
            </div>
          </header>
        )}
        {!view.progress && (
          <div className="sb-note-card-actions">
            {pl.cadenceOptions.map((c) => (
              <button
                key={c["@id"]}
                className="sb-note-button sb-note-button-primary"
                onClick={() => void plans.start(pl["@id"], c["@id"])}
              >
                {t("start-plan", { defaultValue: "Start" })} · {c.label}
              </button>
            ))}
          </div>
        )}
        {total === 0 ? (
          <p className="sb-rpd-empty">
            {t("reading-plan-empty-sessions", {
              defaultValue: "This plan doesn't have any readings yet.",
            })}
          </p>
        ) : (
          <div className="sb-rpd-body">
            <div className="sb-rpd-day-tabs" role="tablist">
              {sum.days.map((d) => (
                <button
                  key={d.sessionId}
                  type="button"
                  role="tab"
                  aria-selected={d.index === activeIndex}
                  className={`sb-rpd-day-tab${d.index === activeIndex ? " sb-rpd-day-tab-active" : ""}${!sum.selfPaced && d.isToday ? " sb-rpd-day-tab-today" : ""}`}
                  onClick={() => setChosenDay(d.index)}
                >
                  <span className="sb-rpd-day-tab-label">
                    {sum.selfPaced
                      ? t("reading-plan-session-short", {
                          defaultValue: "Session",
                        })
                      : t("reading-plan-day-short", { defaultValue: "Day" })}
                  </span>
                  <span className="sb-rpd-day-tab-num">{d.index + 1}</span>
                  {d.done ? (
                    <span className="material-symbols-outlined sb-rpd-day-tab-check">
                      check
                    </span>
                  ) : d.isToday ? (
                    <span className="sb-rpd-day-tab-dot" aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>
            {session?.label && (
              <h4 className="sb-rpd-section-title">{session.label}</h4>
            )}
            {session && (
              <ul className="sb-rpd-reading-cards">
                {session.readings.map((r) => {
                  const done = isDone(r["@id"]);
                  return (
                    <li key={r["@id"]} className="sb-rpd-reading-row">
                      <div className="sb-rpd-reading-main">
                        <button
                          type="button"
                          className="sb-rpd-reading-toggle"
                          aria-pressed={done}
                          disabled={!view.progress}
                          aria-label={t("reading-plan-mark-reading-complete", {
                            defaultValue: "Mark reading complete",
                          })}
                          onClick={() =>
                            void plans.setDone(
                              pl["@id"],
                              session["@id"],
                              r["@id"],
                              !done
                            )
                          }
                        >
                          <span
                            className={`sb-rpd-reading-check${done ? " sb-rpd-reading-check-done" : ""}`}
                            aria-hidden="true"
                          >
                            <span className="material-symbols-outlined">
                              {done ? "check_circle" : "radio_button_unchecked"}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`sb-rpd-reading-card sb-rpd-reading-card-open${done ? " sb-rpd-reading-card-done" : ""}`}
                          onClick={() => openItem(state, r.item)}
                        >
                          <span
                            className="sb-rpd-reading-icon"
                            aria-hidden="true"
                          >
                            <span className="material-symbols-outlined">
                              {r.item["@type"] === "seed:ScriptureItem"
                                ? "menu_book"
                                : r.item["@type"] === "seed:HtmlItem"
                                  ? "sticky_note_2"
                                  : "link"}
                            </span>
                          </span>
                          <span className="sb-rpd-reading-text">
                            <span className="sb-rpd-reading-title">
                              {itemLabel(state, r.item)}
                            </span>
                            <span className="sb-rpd-reading-meta">
                              {done
                                ? t("reading-plan-reading-read", {
                                    defaultValue: "Read",
                                  })
                                : t("reading-plan-reading-mins", {
                                    defaultValue: "~{{count}} min",
                                    count: readingMinutes([r.item], bookLength),
                                  })}
                            </span>
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {session?.note && (
              <div className="sb-rpd-reflect">
                <div className="sb-rpd-reflect-head">
                  <span className="material-symbols-outlined">lightbulb</span>
                  {t("reading-plan-reflect", { defaultValue: "Reflect" })}
                </div>
                <p className="sb-rpd-reflect-text">{session.note}</p>
              </div>
            )}
          </div>
        )}
        {view.progress && session && (
          <footer className="sb-rpd-footer">
            <div className="sb-rpd-footer-actions">
              <button
                type="button"
                className="sb-note-button sb-note-button-primary"
                onClick={readDay}
              >
                <span className="material-symbols-outlined">play_arrow</span>
                {t("reading-plan-read-day", { defaultValue: "Read" })}
              </button>
              <button
                type="button"
                className="sb-note-button"
                disabled={!allDone}
                onClick={() => void completeDay(activeIndex)}
              >
                {sum.selfPaced
                  ? t("reading-plan-mark-session-complete", {
                      defaultValue: "Mark session {{day}} complete",
                      day: activeIndex + 1,
                    })
                  : t("reading-plan-mark-day-complete", {
                      defaultValue: "Mark Day {{day}} complete",
                      day: activeIndex + 1,
                    })}
              </button>
            </div>
            {!allDone && (
              <p className="sb-rpd-footer-note">
                {t("reading-plan-finish-readings", {
                  defaultValue: "Finish all readings to complete the day",
                })}
              </p>
            )}
          </footer>
        )}
        <div className="sb-note-card-actions sb-rpd-plan-actions">
          {canPublish && (
            <button
              className={`sb-note-button${published ? " sb-note-button-published" : ""}`}
              disabled={state.publishing.busy.value === pl["@id"]}
              onClick={() =>
                void (
                  published
                    ? state.publishing.withdrawWork(pl["@id"], "plan")
                    : state.publishing.publishWork(pl)
                ).catch(() => {})
              }
            >
              {published
                ? t("published", { defaultValue: "Published" })
                : t("publish", { defaultValue: "Publish" })}
            </button>
          )}
          {published && (
            <button className="sb-note-button" onClick={() => void share()}>
              {t("share-plan", { defaultValue: "Share plan" })}
            </button>
          )}
          <button
            className="sb-note-button sb-plan-edit-open"
            onClick={props.onEdit}
          >
            {t("edit-plan", { defaultValue: "Edit" })}
          </button>
          {view.progress && (
            <button
              className="sb-note-button"
              onClick={() => void plans.reset(pl["@id"])}
            >
              {t("restart-plan", { defaultValue: "Restart" })}
            </button>
          )}
          <PictureField
            state={state}
            target={COVER_IMAGE}
            label={t("cover-image", { defaultValue: "Cover image" })}
            cropTitle={t("crop-cover", {
              defaultValue: "Crop the cover image",
            })}
            disabled={!state.session.value}
            onPicked={(url) => plans.update(pl["@id"], { heroImage: url })}
          />
          {pl.heroImage && (
            <button
              className="sb-note-button"
              onClick={() =>
                void plans.update(pl["@id"], { heroImage: undefined })
              }
            >
              {t("remove-cover", { defaultValue: "Remove cover" })}
            </button>
          )}
          <button
            className="sb-note-button sb-note-button-danger"
            onClick={props.onDelete}
          >
            {t("delete-reading-plan", { defaultValue: "Delete" })}
          </button>
        </div>
      </div>
    </article>
  );
}

/** After reading a plan's day through: "Nice reading! Mark Day N complete?" (the old reader's nudge). */
export function PlanNudge({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const n = state.ui.planNudge.value;
  if (!n) return null;
  const close = () => (state.ui.planNudge.value = null);
  return (
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
            passage: n.label,
          })}
        </span>
        <div className="sb-rpb-toast-actions">
          <button
            type="button"
            className="sb-rpb-toast-primary"
            onClick={() => {
              close();
              void state.plans.completeSession(n.planId, n.sessionId);
            }}
          >
            {t("reading-plan-mark-complete", {
              defaultValue: "Mark as complete",
            })}
          </button>
          <button type="button" className="sb-rpb-toast-later" onClick={close}>
            {t("reading-plan-nudge-later", { defaultValue: "Not now" })}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="sb-rpb-toast-close"
        aria-label={t("dismiss", { defaultValue: "Dismiss" })}
        onClick={close}
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
}
