// THE PLAN EDITOR — the old ReadingPlanEditor on a plan card: name and description, days (sessions) added,
// renamed, reordered and removed, readings typed in ("Romans 8:28-39") or taken from the screen, edited, reordered
// and removed within a day, and the paces the plan offers. Edits stay a draft until Save (state/library/planEdits.ts).
import { useEffect, useState } from "preact/hooks";
import type { PlaylistItem, ReadingPlan } from "@seed/seed-schema";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  PLAN_CADENCES,
  addReading,
  addSession,
  moveReading,
  moveSession,
  planProblem,
  removeReading,
  removeSession,
  renameSession,
  setDetails,
  toggleCadence,
  updateReading,
} from "../../state/library/planEdits";
import { nowIso } from "../../state/records/marks";

export function PlanEditor({
  state,
  plan,
  onDone,
  parseReference,
  passageOnScreen,
  label,
  ItemEditor,
}: {
  state: ReaderState;
  plan: ReadingPlan;
  onDone: () => void;
  /** A typed reference as a scripture item, or null when it is not one. */
  parseReference: (text: string) => PlaylistItem | null;
  /** The chapter (or selected verses) on screen as a scripture item. */
  passageOnScreen: () => PlaylistItem;
  label: (it: PlaylistItem) => string;
  ItemEditor: (p: {
    item: PlaylistItem;
    onSave: (next: PlaylistItem) => void;
    onCancel: () => void;
  }) => preact.JSX.Element;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(plan);
  const [name, setName] = useState(plan.label);
  const [description, setDescription] = useState(plan.description ?? "");
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [bad, setBad] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The day being worked on: the verse toolbar's Add to plan (the old reader's) puts the chosen verses there.
  const [day, setDay] = useState(Math.max(0, plan.hasSession.length - 1));
  const today = Math.min(day, draft.hasSession.length - 1);
  useEffect(() => {
    state.ui.planEditing.value = { planId: plan["@id"], day: today };
  }, [today]);
  useEffect(
    () => () => {
      state.ui.planEditing.value = null;
    },
    []
  );
  const incoming = state.ui.planAdd.value;
  useEffect(() => {
    if (!incoming) return;
    state.ui.planAdd.value = null;
    setDraft((d) =>
      addReading(d, Math.min(day, d.hasSession.length - 1), incoming)
    );
  }, [incoming]);
  const withDetails = setDetails(draft, name, description);
  const problem = name.trim() ? planProblem(withDetails) : "name";

  const cadenceLabel = (id: string) =>
    id === "daily"
      ? t("plan-cadence-daily", { defaultValue: "Daily" })
      : id === "every-other-day"
        ? t("plan-cadence-every-other-day", { defaultValue: "Every other day" })
        : id === "weekly"
          ? t("plan-cadence-weekly", { defaultValue: "Weekly" })
          : t("plan-cadence-self-paced", { defaultValue: "Self-paced" });

  const addTyped = (si: number) => {
    const item = parseReference(refs[si] ?? "");
    if (!item) {
      setBad(si);
      return;
    }
    setBad(null);
    setDraft(addReading(draft, si, item));
    setRefs({ ...refs, [si]: "" });
  };

  const save = async () => {
    setSaving(true);
    try {
      await state.plans.save({ ...withDetails, updatedAt: nowIso() });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const icon = (
    name: string,
    aria: string,
    onClick: () => void,
    disabled = false
  ) => (
    <button
      type="button"
      className="sb-note-button sb-plan-edit-icon material-symbols-outlined"
      aria-label={aria}
      title={aria}
      disabled={disabled}
      onClick={onClick}
    >
      {name}
    </button>
  );

  return (
    <div className="sb-plan-editor">
      <input
        className="sb-note-editor"
        aria-label={t("plan-name", { defaultValue: "Plan name" })}
        placeholder={t("plan-name", { defaultValue: "Plan name" })}
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <textarea
        className="sb-note-editor"
        rows={2}
        aria-label={t("plan-description", { defaultValue: "Description" })}
        placeholder={t("plan-description", { defaultValue: "Description" })}
        value={description}
        onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
      />
      {draft.hasSession.map((s, si) => {
        const day = t("plan-day-n", { defaultValue: "Day {{n}}", n: si + 1 });
        return (
          <div
            key={s["@id"]}
            className={`sb-rpd-reading-card sb-plan-edit-day${si === today ? " sb-plan-edit-day-current" : ""}`}
            onClickCapture={() => setDay(si)}
            onFocusCapture={() => setDay(si)}
          >
            <div className="sb-plan-edit-row">
              <input
                className="sb-note-editor sb-plan-edit-day-name"
                aria-label={t("plan-day-name", {
                  defaultValue: "Name of {{day}}",
                  day,
                })}
                placeholder={day}
                value={s.label ?? ""}
                onInput={(e) =>
                  setDraft(
                    renameSession(
                      draft,
                      si,
                      (e.target as HTMLInputElement).value
                    )
                  )
                }
              />
              {icon(
                "arrow_upward",
                t("plan-day-up", { defaultValue: "Move {{day}} up", day }),
                () => setDraft(moveSession(draft, si, -1)),
                si === 0
              )}
              {icon(
                "arrow_downward",
                t("plan-day-down", { defaultValue: "Move {{day}} down", day }),
                () => setDraft(moveSession(draft, si, 1)),
                si === draft.hasSession.length - 1
              )}
              {icon(
                "delete",
                t("plan-day-remove", { defaultValue: "Remove {{day}}", day }),
                () => setDraft(removeSession(draft, si)),
                draft.hasSession.length === 1
              )}
            </div>
            {!s.readings.length && (
              <p className="sb-small sb-muted">
                {t("reading-plan-session-empty", {
                  defaultValue: "No readings yet in this session",
                })}
              </p>
            )}
            {s.readings.map((r, ri) => {
              const what = label(r.item);
              const key = `${si}:${ri}`;
              return editing === key ? (
                <ItemEditor
                  key={key}
                  item={r.item}
                  onCancel={() => setEditing(null)}
                  onSave={(next) => {
                    setDraft(updateReading(draft, si, ri, next));
                    setEditing(null);
                  }}
                />
              ) : (
                <div
                  key={r["@id"]}
                  className="sb-plan-edit-row sb-plan-edit-reading"
                >
                  <span className="sb-plan-edit-label">{what}</span>
                  {icon(
                    "arrow_upward",
                    t("plan-reading-up", {
                      defaultValue: "Move {{what}} up",
                      what,
                    }),
                    () => setDraft(moveReading(draft, si, ri, -1)),
                    ri === 0
                  )}
                  {icon(
                    "arrow_downward",
                    t("plan-reading-down", {
                      defaultValue: "Move {{what}} down",
                      what,
                    }),
                    () => setDraft(moveReading(draft, si, ri, 1)),
                    ri === s.readings.length - 1
                  )}
                  {icon(
                    "edit",
                    t("plan-reading-edit", {
                      defaultValue: "Edit {{what}}",
                      what,
                    }),
                    () => setEditing(key)
                  )}
                  {icon(
                    "close",
                    t("plan-reading-remove", {
                      defaultValue: "Remove {{what}}",
                      what,
                    }),
                    () => setDraft(removeReading(draft, si, ri))
                  )}
                </div>
              );
            })}
            <form
              className="sb-plan-edit-row"
              onSubmit={(e) => {
                e.preventDefault();
                addTyped(si);
              }}
            >
              <input
                className="sb-note-editor"
                aria-label={t("plan-add-reading-to", {
                  defaultValue: "Add a reading to {{day}}",
                  day,
                })}
                placeholder={t("plan-reading-placeholder", {
                  defaultValue: "Romans 8:28-39",
                })}
                value={refs[si] ?? ""}
                onInput={(e) =>
                  setRefs({
                    ...refs,
                    [si]: (e.target as HTMLInputElement).value,
                  })
                }
              />
              <button type="submit" className="sb-note-button">
                {t("add", { defaultValue: "Add" })}
              </button>
              <button
                type="button"
                className="sb-note-button"
                onClick={() =>
                  setDraft(addReading(draft, si, passageOnScreen()))
                }
              >
                {t("plan-add-on-screen", {
                  defaultValue: "Add what is on screen",
                })}
              </button>
            </form>
            {bad === si && (
              <p className="sb-error sb-small">
                {t("plan-reading-unknown", {
                  defaultValue: "That is not a passage this Bible knows.",
                })}
              </p>
            )}
          </div>
        );
      })}
      <div className="sb-note-card-actions">
        <button
          type="button"
          className="sb-note-button"
          onClick={() => setDraft(addSession(draft))}
        >
          {t("reading-plan-add-session", { defaultValue: "Add session" })}
        </button>
      </div>
      <fieldset className="sb-plan-edit-cadences">
        <legend className="sb-small">
          {t("plan-paces", { defaultValue: "Paces this plan offers" })}
        </legend>
        {PLAN_CADENCES.map((c) => (
          <label key={c["@id"]} className="sb-small sb-check">
            <input
              type="checkbox"
              checked={draft.cadenceOptions.some((o) => o["@id"] === c["@id"])}
              onChange={() => setDraft(toggleCadence(draft, c["@id"]))}
            />{" "}
            {cadenceLabel(c["@id"])}
          </label>
        ))}
      </fieldset>
      {problem && (
        <p className="sb-small sb-muted">
          {problem === "name"
            ? t("reading-plan-needs-name", {
                defaultValue: "Give your plan a name to save it",
              })
            : t("reading-plan-no-readings", {
                defaultValue: "Add at least one reading to create the plan",
              })}
        </p>
      )}
      <div className="sb-note-card-actions">
        <button
          type="button"
          className="sb-note-button sb-note-button-primary"
          disabled={!!problem || saving}
          onClick={() => void save()}
        >
          {t("reading-plan-save-changes", { defaultValue: "Save changes" })}
        </button>
        <button type="button" className="sb-note-button" onClick={onDone}>
          {t("cancel", { defaultValue: "Cancel" })}
        </button>
      </div>
    </div>
  );
}
