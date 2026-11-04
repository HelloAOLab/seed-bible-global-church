// FAITH — the reader's own faith life beside the Bible: Prayer (requests and thanksgivings, "I prayed", answered in
// their words), Journey (where they say they are, the milestones they reached, next steps) and Care (asking their
// church's leaders for a call or a visit). Every record is kept by the reader's own agent in their vault; each one
// says who may see it, and it starts as only them.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  MILESTONES,
  STAGES,
  type Church,
  type Milestone,
  type Prayer,
  type Stage,
  type Visibility,
} from "../../state/faith/faith";

type Tab = "prayer" | "journey" | "care";
type T = ReturnType<typeof useI18n>["t"];

const STAGE_TEXT: Record<Stage, [string, string]> = {
  Seeker: ["Exploring", "Exploring faith and asking questions"],
  GospelClarity: [
    "Understanding the gospel",
    "Coming to understand who Jesus is and what he has done",
  ],
  Conversion: [
    "Deciding to follow Jesus",
    "Turning to Christ in repentance and faith",
  ],
  NewBeliever: [
    "New believer",
    "Newly following Jesus and learning the basics",
  ],
  Connected: ["Connected", "Belonging to a church and a group of believers"],
  Growing: ["Growing", "Growing in Scripture, prayer and character"],
  Serving: ["Serving", "Using your gifts to serve others"],
  Multiplying: ["Multiplying", "Helping others follow Jesus"],
  Leader: ["Leading", "Leading and shepherding others"],
};
const MILESTONE_TEXT: Record<Milestone, string> = {
  UnderstoodGospel: "Understood the gospel",
  ProfessionOfFaith: "Professed faith in Jesus",
  Baptized: "Baptized",
  JoinedGroup: "Joined a group",
  FoundationsClass: "Took a foundations class",
  StartedServing: "Started serving",
  SharedTestimony: "Shared my story",
};

/** "Who can see this?" in plain words, for the choices this page offers. */
function whoLabel(t: T, v: Visibility): string {
  switch (v) {
    case "Confidential":
      return t("faith-who-me", { defaultValue: "Only me" });
    case "Friends":
      return t("faith-who-friends", { defaultValue: "My friends" });
    case "LeadersOnly":
      return t("faith-who-leaders", { defaultValue: "My church's leaders" });
    case "BodyOnly":
      return t("faith-who-church", { defaultValue: "My church" });
    default:
      return t("faith-who-anyone", { defaultValue: "Anyone I share with" });
  }
}

const OFFERED: Visibility[] = [
  "Confidential",
  "Friends",
  "LeadersOnly",
  "BodyOnly",
];
const needsChurch = (v: Visibility) => v === "LeadersOnly" || v === "BodyOnly";

function WhoCanSee(props: {
  value: Visibility;
  church: string;
  churches: Church[];
  onChange: (v: Visibility, church: string) => void;
  idPrefix: string;
}) {
  const { t } = useI18n();
  return (
    <div className="sb-faith-who">
      <label htmlFor={`${props.idPrefix}-who`}>
        {t("faith-who-can-see", { defaultValue: "Who can see this?" })}
      </label>
      <select
        id={`${props.idPrefix}-who`}
        value={props.value}
        onChange={(e) =>
          props.onChange(
            (e.target as HTMLSelectElement).value as Visibility,
            props.church || props.churches[0]?.agent || ""
          )
        }
      >
        {OFFERED.map((v) => (
          <option
            key={v}
            value={v}
            disabled={needsChurch(v) && !props.churches.length}
          >
            {whoLabel(t, v)}
          </option>
        ))}
      </select>
      {needsChurch(props.value) && props.churches.length > 1 && (
        <select
          aria-label={t("faith-which-church", { defaultValue: "Which church" })}
          value={props.church}
          onChange={(e) =>
            props.onChange(props.value, (e.target as HTMLSelectElement).value)
          }
        >
          {props.churches.map((c) => (
            <option key={c.agent} value={c.agent}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {!props.churches.length && (
        <p className="sb-faith-hint">
          {t("faith-share-church-hint", {
            defaultValue:
              "To share with your church, choose it on the Care tab first.",
          })}
        </p>
      )}
    </div>
  );
}

/** Find your church on FaithNet by its name and choose it, when your Home links you to none. */
function ChurchFinder({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { faith } = state;
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Church[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="sb-faith-finder">
      <p className="sb-faith-hint">
        {t("faith-find-church-hint", {
          defaultValue:
            "Your Home does not link you to a church yet. Find yours on FaithNet:",
        })}
      </p>
      <div className="sb-faith-form-row">
        <input
          id="faith-church-search"
          aria-label={t("faith-church-name", {
            defaultValue: "Your church's name",
          })}
          placeholder={t("faith-church-name", {
            defaultValue: "Your church's name",
          })}
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (
                e.currentTarget.nextElementSibling as HTMLButtonElement | null
              )?.click();
            }
          }}
        />
        <button
          type="button"
          className="sb-faith-button"
          disabled={!q.trim() || busy}
          onClick={() => {
            setBusy(true);
            void faith.findChurches(q).then((r) => {
              setFound(r);
              setBusy(false);
            });
          }}
        >
          {t("faith-find", { defaultValue: "Find" })}
        </button>
      </div>
      {found && !found.length && (
        <p className="sb-faith-empty">
          {t("faith-no-church-found", {
            defaultValue: "No church by that name on FaithNet yet.",
          })}
        </p>
      )}
      {found && found.length > 0 && (
        <ul className="sb-faith-list">
          {found.map((c) => (
            <li key={c.agent}>
              <button
                type="button"
                className="sb-faith-button"
                onClick={() => {
                  void faith.chooseChurch(c);
                  setFound(null);
                  setQ("");
                }}
              >
                {t("faith-this-is-my-church", {
                  defaultValue: "{{church}} is my church",
                  church: c.name,
                })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PrayerTab({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { faith } = state;
  const churches = faith.churches.value;
  const [label, setLabel] = useState("");
  const [prayingFor, setPrayingFor] = useState("");
  const [kind, setKind] = useState<"Request" | "Thanksgiving">("Request");
  const [who, setWho] = useState<Visibility>("Confidential");
  const [church, setChurch] = useState("");
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const all = faith.prayers.value.prayers;
  const praying = all.filter(
    (p) => p.status === "expressed" && p.kind === "Request"
  );
  const thanks = all.filter(
    (p) => p.status === "expressed" && p.kind === "Thanksgiving"
  );
  const answered = all.filter((p) => p.status === "fulfilled");

  async function add(e: Event) {
    e.preventDefault();
    if (!label.trim()) return;
    const ok = await faith.savePrayer({
      label: label.trim(),
      kind,
      ...(prayingFor.trim() ? { prayingFor: prayingFor.trim() } : {}),
      visibility: who,
      ...(needsChurch(who) && church ? { sharedWith: [church] } : {}),
    });
    if (ok) {
      setLabel("");
      setPrayingFor("");
    }
  }

  const card = (p: Prayer) => (
    <li key={p.id} className="sb-faith-card" data-prayer={p.id}>
      <div className="sb-faith-card-main">
        <p className="sb-faith-card-title">{p.label}</p>
        {p.prayingFor && (
          <p className="sb-faith-card-sub">
            {t("faith-praying-for", {
              defaultValue: "For {{who}}",
              who: p.prayingFor,
            })}
          </p>
        )}
        {p.answered?.description && (
          <p className="sb-faith-card-answer">{p.answered.description}</p>
        )}
        <p className="sb-faith-card-meta">
          <span className="sb-faith-chip">{whoLabel(t, p.visibility)}</span>
          {p.prayedCount > 0 && (
            <span>
              {t("faith-prayed-count", {
                defaultValue: "Prayed {{count}} times",
                count: p.prayedCount,
              })}
            </span>
          )}
        </p>
      </div>
      {p.status === "expressed" && (
        <div className="sb-faith-card-actions">
          <button
            type="button"
            className="sb-faith-button"
            onClick={() => void faith.savePrayer({ id: p.id, prayed: true })}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              volunteer_activism
            </span>
            {t("faith-i-prayed", { defaultValue: "I prayed" })}
          </button>
          {p.kind === "Request" && (
            <button
              type="button"
              className="sb-faith-button"
              onClick={() => {
                setAnswering(p.id);
                setAnswer("");
              }}
            >
              {t("faith-answered", { defaultValue: "Answered" })}
            </button>
          )}
          <button
            type="button"
            className="sb-faith-button sb-faith-button-quiet"
            onClick={() =>
              void faith.savePrayer({ id: p.id, status: "withdrawn" })
            }
          >
            {t("faith-stop-praying", { defaultValue: "Stop praying" })}
          </button>
        </div>
      )}
      {p.status !== "expressed" && (
        <div className="sb-faith-card-actions">
          <button
            type="button"
            className="sb-faith-button sb-faith-button-quiet"
            onClick={() => void faith.savePrayer({ id: p.id, remove: true })}
          >
            {t("remove", { defaultValue: "Remove" })}
          </button>
        </div>
      )}
      {answering === p.id && (
        <form
          className="sb-faith-answer-form"
          onSubmit={(e) => {
            e.preventDefault();
            void faith
              .savePrayer({ id: p.id, answered: answer.trim() || "Answered" })
              .then((ok) => ok && setAnswering(null));
          }}
        >
          <label htmlFor={`answer-${p.id}`}>
            {t("faith-how-answered", { defaultValue: "How was it answered?" })}
          </label>
          <textarea
            id={`answer-${p.id}`}
            value={answer}
            rows={2}
            onInput={(e) => setAnswer((e.target as HTMLTextAreaElement).value)}
          />
          <div className="sb-faith-form-row">
            <button
              type="submit"
              className="sb-faith-button sb-faith-button-primary"
            >
              {t("faith-save", { defaultValue: "Save" })}
            </button>
            <button
              type="button"
              className="sb-faith-button sb-faith-button-quiet"
              onClick={() => setAnswering(null)}
            >
              {t("cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        </form>
      )}
    </li>
  );

  return (
    <div className="sb-faith-tab">
      <form className="sb-faith-form" onSubmit={(e) => void add(e)}>
        <div
          className="sb-faith-kind"
          role="radiogroup"
          aria-label={t("faith-kind", { defaultValue: "Kind of prayer" })}
        >
          {(["Request", "Thanksgiving"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={`sb-selector-pane-chip${kind === k ? " sb-selector-pane-chip-selected" : ""}`}
              onClick={() => setKind(k)}
            >
              {k === "Request"
                ? t("faith-request", { defaultValue: "Prayer request" })
                : t("faith-thanksgiving", { defaultValue: "Thanksgiving" })}
            </button>
          ))}
        </div>
        <label htmlFor="faith-prayer-label">
          {kind === "Request"
            ? t("faith-what-pray", {
                defaultValue: "What would you like to pray about?",
              })
            : t("faith-what-thanks", {
                defaultValue: "What are you thankful for?",
              })}
        </label>
        <textarea
          id="faith-prayer-label"
          rows={2}
          value={label}
          onInput={(e) => setLabel((e.target as HTMLTextAreaElement).value)}
        />
        {kind === "Request" && (
          <>
            <label htmlFor="faith-praying-for">
              {t("faith-for-whom", {
                defaultValue: "Who is it for? (optional)",
              })}
            </label>
            <input
              id="faith-praying-for"
              value={prayingFor}
              onInput={(e) =>
                setPrayingFor((e.target as HTMLInputElement).value)
              }
            />
          </>
        )}
        <WhoCanSee
          value={who}
          church={church}
          churches={churches}
          idPrefix="faith-prayer"
          onChange={(v, c) => {
            setWho(v);
            setChurch(c);
          }}
        />
        <button
          type="submit"
          className="sb-faith-button sb-faith-button-primary"
          disabled={!label.trim()}
        >
          {t("faith-add-prayer", { defaultValue: "Add" })}
        </button>
      </form>

      <h3 className="sb-faith-heading">
        {t("faith-praying", { defaultValue: "Praying" })}
      </h3>
      {praying.length ? (
        <ul className="sb-faith-list">{praying.map(card)}</ul>
      ) : (
        <p className="sb-faith-empty">
          {t("faith-no-prayers", {
            defaultValue:
              "Nothing yet. Add what is on your heart, and come back to pray for it.",
          })}
        </p>
      )}
      {thanks.length > 0 && (
        <>
          <h3 className="sb-faith-heading">
            {t("faith-thanksgivings", { defaultValue: "Thanksgivings" })}
          </h3>
          <ul className="sb-faith-list">{thanks.map(card)}</ul>
        </>
      )}
      {answered.length > 0 && (
        <>
          <h3 className="sb-faith-heading">
            {t("faith-answered-prayers", { defaultValue: "Answered prayers" })}
          </h3>
          <ul className="sb-faith-list">{answered.map(card)}</ul>
        </>
      )}
    </div>
  );
}

function JourneyTab({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { faith } = state;
  const j = faith.journey.value;
  const churches = faith.churches.value;
  const [milestone, setMilestone] = useState<Milestone>("Baptized");
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [who, setWho] = useState<Visibility>("Confidential");
  const [church, setChurch] = useState("");
  const current = j.stage?.stage;
  const shareArgs = () => ({
    visibility: who,
    ...(needsChurch(who) && church ? { sharedWith: [church] } : {}),
  });

  return (
    <div className="sb-faith-tab">
      <h3 className="sb-faith-heading">
        {t("faith-where-are-you", {
          defaultValue: "Where are you on your journey?",
        })}
      </h3>
      <p className="sb-faith-hint">
        {t("faith-stage-hint", {
          defaultValue:
            "Choose what fits you today. Each choice is kept with its date, so you can see how far you have come.",
        })}
      </p>
      <ol className="sb-faith-stages">
        {STAGES.map((s) => (
          <li key={s}>
            <button
              type="button"
              className={`sb-faith-stage${current === s ? " sb-faith-stage-current" : ""}`}
              aria-pressed={current === s}
              onClick={() =>
                current !== s &&
                void faith.recordJourney({ stage: s, ...shareArgs() })
              }
            >
              <span className="sb-faith-stage-name">
                {t(`faith-stage-${s}`, { defaultValue: STAGE_TEXT[s][0] })}
              </span>
              <span className="sb-faith-stage-desc">
                {t(`faith-stage-${s}-desc`, { defaultValue: STAGE_TEXT[s][1] })}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {j.nextSteps.length > 0 && (
        <>
          <h3 className="sb-faith-heading">
            {t("faith-next-steps", { defaultValue: "Next steps" })}
          </h3>
          <ul className="sb-faith-steps">
            {j.nextSteps.map((s) => (
              <li key={`${s.kind}:${s.value}`}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {s.kind === "milestone" ? "flag" : "self_improvement"}
                </span>
                {s.label}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="sb-faith-heading">
        {t("faith-milestones", { defaultValue: "Milestones" })}
      </h3>
      {j.milestones.length ? (
        <ul className="sb-faith-list">
          {j.milestones.map((m) => (
            <li key={m.id} className="sb-faith-card">
              <div className="sb-faith-card-main">
                <p className="sb-faith-card-title">
                  {t(`faith-milestone-${m.milestone}`, {
                    defaultValue: MILESTONE_TEXT[m.milestone] ?? m.label,
                  })}
                </p>
                {(m.occurredOn || m.place) && (
                  <p className="sb-faith-card-sub">
                    {[m.occurredOn, m.place].filter(Boolean).join(" · ")}
                  </p>
                )}
                {m.note && <p className="sb-faith-card-answer">{m.note}</p>}
                <p className="sb-faith-card-meta">
                  <span className="sb-faith-chip">
                    {whoLabel(t, m.visibility)}
                  </span>
                </p>
              </div>
              <div className="sb-faith-card-actions">
                <button
                  type="button"
                  className="sb-faith-button sb-faith-button-quiet"
                  onClick={() => void faith.recordJourney({ remove: m.id })}
                >
                  {t("remove", { defaultValue: "Remove" })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sb-faith-empty">
          {t("faith-no-milestones", { defaultValue: "No milestones yet." })}
        </p>
      )}
      <form
        className="sb-faith-form"
        onSubmit={(e) => {
          e.preventDefault();
          void faith
            .recordJourney({
              milestone,
              ...(date ? { occurredOn: date } : {}),
              ...(place.trim() ? { place: place.trim() } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
              ...shareArgs(),
            })
            .then((ok) => {
              if (!ok) return;
              setDate("");
              setPlace("");
              setNote("");
            });
        }}
      >
        <label htmlFor="faith-milestone">
          {t("faith-add-milestone", { defaultValue: "Add a milestone" })}
        </label>
        <select
          id="faith-milestone"
          value={milestone}
          onChange={(e) =>
            setMilestone((e.target as HTMLSelectElement).value as Milestone)
          }
        >
          {MILESTONES.map((m) => (
            <option key={m} value={m}>
              {t(`faith-milestone-${m}`, { defaultValue: MILESTONE_TEXT[m] })}
            </option>
          ))}
        </select>
        <label htmlFor="faith-milestone-date">
          {t("faith-when", { defaultValue: "When (optional)" })}
        </label>
        <input
          id="faith-milestone-date"
          type="date"
          value={date}
          onInput={(e) => setDate((e.target as HTMLInputElement).value)}
        />
        <label htmlFor="faith-milestone-place">
          {t("faith-where", { defaultValue: "Where (optional)" })}
        </label>
        <input
          id="faith-milestone-place"
          value={place}
          onInput={(e) => setPlace((e.target as HTMLInputElement).value)}
        />
        <label htmlFor="faith-milestone-note">
          {t("faith-your-story", { defaultValue: "Your story (optional)" })}
        </label>
        <textarea
          id="faith-milestone-note"
          rows={2}
          value={note}
          onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        />
        <WhoCanSee
          value={who}
          church={church}
          churches={churches}
          idPrefix="faith-journey"
          onChange={(v, c) => {
            setWho(v);
            setChurch(c);
          }}
        />
        <button
          type="submit"
          className="sb-faith-button sb-faith-button-primary"
        >
          {t("faith-save", { defaultValue: "Save" })}
        </button>
      </form>
    </div>
  );
}

function CareTab({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { faith } = state;
  const churches = faith.churches.value;
  const [label, setLabel] = useState("");
  const [urgency, setUrgency] = useState<"Low" | "Normal" | "High">("Normal");
  const [text, setText] = useState(false);
  const [church, setChurch] = useState("");
  const chosen = church || churches[0]?.agent || "";
  const care = faith.prayers.value.care;
  return (
    <div className="sb-faith-tab">
      <p className="sb-faith-hint">
        {t("faith-care-hint", {
          defaultValue:
            "Ask your church's leaders for a call, a visit, or someone to pray with you. Only your church's leaders will see it.",
        })}
      </p>
      <p className="sb-faith-emergency" role="note">
        {t("faith-care-emergency", {
          defaultValue:
            "This is not for emergencies. If you or someone else is in danger, call your local emergency number now.",
        })}
      </p>
      <form
        className="sb-faith-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          void faith
            .requestCare({
              label: label.trim(),
              urgency,
              safeToText: text,
              ...(chosen ? { church: chosen } : {}),
            })
            .then((ok) => ok && setLabel(""));
        }}
      >
        <label htmlFor="faith-care-label">
          {t("faith-care-what", { defaultValue: "What would help?" })}
        </label>
        <textarea
          id="faith-care-label"
          rows={3}
          value={label}
          onInput={(e) => setLabel((e.target as HTMLTextAreaElement).value)}
        />
        <label htmlFor="faith-care-urgency">
          {t("faith-care-when", { defaultValue: "How soon?" })}
        </label>
        <select
          id="faith-care-urgency"
          value={urgency}
          onChange={(e) =>
            setUrgency(
              (e.target as HTMLSelectElement).value as "Low" | "Normal" | "High"
            )
          }
        >
          <option value="Low">
            {t("faith-care-low", { defaultValue: "When you can" })}
          </option>
          <option value="Normal">
            {t("faith-care-normal", { defaultValue: "This week" })}
          </option>
          <option value="High">
            {t("faith-care-high", { defaultValue: "As soon as possible" })}
          </option>
        </select>
        {churches.length > 1 ? (
          <>
            <label htmlFor="faith-care-church">
              {t("faith-which-church", { defaultValue: "Which church" })}
            </label>
            <select
              id="faith-care-church"
              value={chosen}
              onChange={(e) => setChurch((e.target as HTMLSelectElement).value)}
            >
              {churches.map((c) => (
                <option key={c.agent} value={c.agent}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        ) : churches.length === 1 ? (
          <p className="sb-faith-hint">
            {t("faith-care-to", {
              defaultValue: "Goes to the leaders of {{church}}.",
              church: churches[0]!.name,
            })}{" "}
            {faith.chosenChurch.value?.agent === churches[0]!.agent && (
              <button
                type="button"
                className="sb-faith-button sb-faith-button-quiet"
                onClick={() => void faith.chooseChurch(null)}
              >
                {t("faith-change-church", { defaultValue: "Change" })}
              </button>
            )}
          </p>
        ) : (
          <ChurchFinder state={state} />
        )}
        <label className="sb-faith-check">
          <input
            type="checkbox"
            checked={text}
            onChange={(e) => setText((e.target as HTMLInputElement).checked)}
          />
          {t("faith-care-text-ok", {
            defaultValue: "It's OK to text me about this",
          })}
        </label>
        <button
          type="submit"
          className="sb-faith-button sb-faith-button-primary"
          disabled={!label.trim()}
        >
          {t("faith-care-send", { defaultValue: "Ask for care" })}
        </button>
      </form>
      {care.length > 0 && (
        <>
          <h3 className="sb-faith-heading">
            {t("faith-care-yours", { defaultValue: "Your requests" })}
          </h3>
          <ul className="sb-faith-list">
            {care.map((c) => (
              <li key={c.id} className="sb-faith-card">
                <div className="sb-faith-card-main">
                  <p className="sb-faith-card-title">{c.label}</p>
                  <p className="sb-faith-card-meta">
                    <span className="sb-faith-chip">
                      {c.status === "withdrawn"
                        ? t("faith-care-withdrawn", {
                            defaultValue: "Withdrawn",
                          })
                        : c.sharedWith?.length
                          ? t("faith-care-sent", {
                              defaultValue: "Sent to your church's leaders",
                            })
                          : t("faith-who-me", { defaultValue: "Only me" })}
                    </span>
                  </p>
                </div>
                {c.status === "expressed" && (
                  <div className="sb-faith-card-actions">
                    <button
                      type="button"
                      className="sb-faith-button sb-faith-button-quiet"
                      onClick={() =>
                        void faith.requestCare({ id: c.id, withdraw: true })
                      }
                    >
                      {t("faith-care-withdraw", {
                        defaultValue: "I don't need this any more",
                      })}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function FaithPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("prayer");
  const { faith } = state;
  const signedIn = !!state.session.value;
  useEffect(() => {
    if (signedIn) void faith.refresh();
  }, [signedIn]);
  const msg = faith.message.value;
  const tabs: Array<[Tab, string]> = [
    ["prayer", t("faith-tab-prayer", { defaultValue: "Prayer" })],
    ["journey", t("faith-tab-journey", { defaultValue: "Journey" })],
    ["care", t("faith-tab-care", { defaultValue: "Care" })],
  ];
  return (
    <section
      className="sb-pane sb-faith"
      aria-label={t("faith", { defaultValue: "Faith" })}
    >
      <header className="sb-pane-header">
        <div className="sb-selector-pane-picker" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`sb-selector-pane-chip${tab === id ? " sb-selector-pane-chip-selected" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <button
            className="sb-pane-close"
            aria-label={t("close", { defaultValue: "Close" })}
            onClick={() => (state.ui.pane.value = "none")}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>
      {!signedIn ? (
        <div className="sb-faith-tab">
          <p className="sb-faith-hint">
            {t("faith-signed-out", {
              defaultValue:
                "Sign in to keep your prayers and your faith journey. They are kept in your own Home, and only you can see them unless you choose to share.",
            })}
          </p>
          <button
            type="button"
            className="sb-faith-button sb-faith-button-primary"
            onClick={() => (state.ui.pane.value = "profile")}
          >
            {t("sign-in", { defaultValue: "Sign in" })}
          </button>
        </div>
      ) : (
        <>
          {msg && (
            <p
              className={msg.error ? "sb-pane-error" : "sb-faith-message"}
              role="status"
            >
              {msg.text}
            </p>
          )}
          {faith.loading.value && !faith.loaded.value ? (
            <p className="sb-faith-hint">
              {t("loading", { defaultValue: "Loading…" })}
            </p>
          ) : tab === "prayer" ? (
            <PrayerTab state={state} />
          ) : tab === "journey" ? (
            <JourneyTab state={state} />
          ) : (
            <CareTab state={state} />
          )}
        </>
      )}
    </section>
  );
}
