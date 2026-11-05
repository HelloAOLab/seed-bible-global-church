// MORE → GROUPS (ap-church spec 204): the groups the reader is part of — a home group, a men's group. A church's groups
// come from what the church says of itself; which ones are the reader's is kept by their own agent beside their
// church, so the Church app shows the same list. The church is not told, and a church's groups are managed in the
// Church app, never here.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  GROUP_KINDS,
  type ChurchDescription,
  type ChurchGroup,
  type GroupKind,
  type MyGroup,
} from "../../state/faith/faith";

type T = ReturnType<typeof useI18n>["t"];

const KIND_TEXT: Record<GroupKind, string> = {
  home: "Home group",
  men: "Men",
  women: "Women",
  couples: "Couples",
  youth: "Youth",
  "young-adults": "Young adults",
  "bible-study": "Bible study",
  prayer: "Prayer",
  serving: "Serving",
  other: "Other",
};
export const kindLabel = (t: T, kind: GroupKind) =>
  t(`group-kind-${kind}`, { defaultValue: KIND_TEXT[kind] ?? KIND_TEXT.other });

/** What the church said of each of the reader's churches; `null` while it is being asked, `false` when it could not be. */
function useDescriptions(state: ReaderState) {
  const { faith } = state;
  const names = faith.churchHome.value.churches.map((c) => c.name);
  const [byName, setByName] = useState<
    Record<string, ChurchDescription | false>
  >({});
  useEffect(() => {
    let live = true;
    for (const name of names)
      void faith.describeChurch(name).then((d) => {
        if (live) setByName((m) => ({ ...m, [name]: d ?? false }));
      });
    return () => {
      live = false;
    };
  }, [names.join("|")]);
  return byName;
}

function MyGroups({
  state,
  busy,
  run,
}: {
  state: ReaderState;
  busy: boolean;
  run: (act: () => Promise<boolean>) => void;
}) {
  const { t } = useI18n();
  const { faith } = state;
  const home = faith.churchHome.value;
  const churchName = (g: MyGroup) => {
    const c = home.churches.find((x) => x.agent === g.church);
    return c ? (c.displayName ?? c.name) : null;
  };
  return (
    <>
      <h3 className="sb-faith-heading">
        {t("groups-mine", { defaultValue: "My groups" })}
      </h3>
      {home.groups.length === 0 ? (
        <p className="sb-faith-empty">
          {t("groups-mine-empty", {
            defaultValue: "You have not added a group yet.",
          })}
        </p>
      ) : (
        <ul
          className="sb-faith-list"
          aria-label={t("groups-mine", { defaultValue: "My groups" })}
        >
          {home.groups.map((g) => (
            <li key={`${g.church ?? "own"}:${g.id}`} className="sb-faith-card">
              <div className="sb-faith-card-main">
                <p className="sb-faith-card-title">{g.name}</p>
                <p className="sb-faith-card-sub">
                  <span className="sb-faith-chip">{kindLabel(t, g.kind)}</span>
                  <span>
                    {churchName(g) ??
                      t("groups-own", { defaultValue: "Your own group" })}
                  </span>
                </p>
              </div>
              <div className="sb-faith-card-actions">
                <button
                  type="button"
                  className="sb-faith-button sb-faith-button-quiet"
                  disabled={busy}
                  aria-label={
                    g.church
                      ? t("groups-leave-named", {
                          name: g.name,
                          defaultValue: `Leave ${g.name}`,
                        })
                      : t("groups-remove-named", {
                          name: g.name,
                          defaultValue: `Remove ${g.name}`,
                        })
                  }
                  onClick={() => run(() => faith.leaveGroup(g))}
                >
                  {g.church
                    ? t("groups-leave", { defaultValue: "Leave" })
                    : t("remove", { defaultValue: "Remove" })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ChurchGroups({
  state,
  church,
  description,
  busy,
  run,
}: {
  state: ReaderState;
  church: { agent: string; name: string; displayName?: string };
  description: ChurchDescription | false | undefined;
  busy: boolean;
  run: (act: () => Promise<boolean>) => void;
}) {
  const { t } = useI18n();
  const { faith } = state;
  const name = church.displayName ?? church.name;
  const mine = faith.churchHome.value.groups;
  const siteName = (g: ChurchGroup) =>
    description
      ? description.sites.find((s) => s.id === g.site)?.name
      : undefined;
  const groups = description ? (description.groups ?? []) : [];
  return (
    <>
      <h3 className="sb-faith-heading">
        {t("groups-at-church", {
          church: name,
          defaultValue: `Groups at ${name}`,
        })}
      </h3>
      {description === undefined ? (
        <p className="sb-faith-hint">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      ) : description === false ? (
        <p className="sb-faith-empty">
          {t("groups-church-unreachable", {
            church: name,
            defaultValue: `${name} could not be asked for its groups just now.`,
          })}
        </p>
      ) : groups.length === 0 ? (
        <p className="sb-faith-empty">
          {t("groups-church-none", {
            church: name,
            defaultValue: `${name} has not listed any groups yet. You can add a group of your own below.`,
          })}
        </p>
      ) : (
        <ul
          className="sb-faith-list"
          aria-label={t("groups-at-church", {
            church: name,
            defaultValue: `Groups at ${name}`,
          })}
        >
          {groups.map((g) => {
            const joined = mine.some(
              (m) => m.church === church.agent && m.id === g.id
            );
            return (
              <li key={g.id} className="sb-faith-card">
                <div className="sb-faith-card-main">
                  <p className="sb-faith-card-title">{g.name}</p>
                  <p className="sb-faith-card-sub">
                    <span className="sb-faith-chip">
                      {kindLabel(t, g.kind)}
                    </span>
                    {[g.schedule, g.location, siteName(g)]
                      .filter(Boolean)
                      .map((x) => (
                        <span key={x}>{x}</span>
                      ))}
                  </p>
                  {g.description && <p>{g.description}</p>}
                </div>
                <div className="sb-faith-card-actions">
                  {joined ? (
                    <>
                      <span className="sb-faith-chip sb-groups-joined">
                        {t("groups-joined", { defaultValue: "In my groups" })}
                      </span>
                      <button
                        type="button"
                        className="sb-faith-button sb-faith-button-quiet"
                        disabled={busy}
                        aria-label={t("groups-leave-named", {
                          name: g.name,
                          defaultValue: `Leave ${g.name}`,
                        })}
                        onClick={() =>
                          run(() =>
                            faith.leaveGroup({ church: church.agent, id: g.id })
                          )
                        }
                      >
                        {t("groups-leave", { defaultValue: "Leave" })}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="sb-faith-button sb-faith-button-primary"
                      disabled={busy}
                      aria-label={t("groups-join-named", {
                        name: g.name,
                        defaultValue: `I'm in ${g.name}`,
                      })}
                      onClick={() =>
                        run(() => faith.joinGroup(church.agent, g.id))
                      }
                    >
                      {t("groups-join", { defaultValue: "I'm in this group" })}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function OwnGroupForm({
  busy,
  add,
}: {
  busy: boolean;
  add: (name: string, kind: GroupKind) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GroupKind>("home");
  return (
    <form
      className="sb-faith-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void add(name, kind).then((ok) => ok && setName(""));
      }}
    >
      <label htmlFor="own-group-name">
        {t("groups-own-name", { defaultValue: "Group name" })}
      </label>
      <input
        id="own-group-name"
        value={name}
        maxLength={120}
        placeholder={t("groups-own-name-placeholder", {
          defaultValue: "Thursday home group",
        })}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <label htmlFor="own-group-kind">
        {t("groups-own-kind", { defaultValue: "Kind of group" })}
      </label>
      <select
        id="own-group-kind"
        value={kind}
        onChange={(e) =>
          setKind((e.target as HTMLSelectElement).value as GroupKind)
        }
      >
        {GROUP_KINDS.map((k) => (
          <option key={k} value={k}>
            {kindLabel(t, k)}
          </option>
        ))}
      </select>
      <div className="sb-faith-card-actions">
        <button
          type="submit"
          className="sb-faith-button sb-faith-button-primary"
          disabled={busy || !name.trim()}
        >
          {t("groups-own-add", { defaultValue: "Add my group" })}
        </button>
      </div>
    </form>
  );
}

export function GroupsTab({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { faith } = state;
  const home = faith.churchHome.value;
  const descriptions = useDescriptions(state);
  const [busy, setBusy] = useState(false);
  const run = (act: () => Promise<boolean>) => {
    setBusy(true);
    void act().finally(() => setBusy(false));
  };
  return (
    <div className="sb-faith-tab">
      <p className="sb-faith-hint">
        {t("groups-hint", {
          defaultValue:
            "The groups you are part of, like a home group or a men's group. Your own agent keeps this list, so the Church app shows the same groups. The church is not told.",
        })}
      </p>
      <MyGroups state={state} busy={busy} run={run} />
      {home.churches.length === 0 ? (
        <>
          <p className="sb-faith-empty">
            {t("groups-no-church", {
              defaultValue:
                "Choose your church to see the groups it lists. You can still add a group of your own below.",
            })}
          </p>
          <div className="sb-faith-card-actions">
            <button
              type="button"
              className="sb-faith-button"
              onClick={() => (state.ui.faithTab.value = "church")}
            >
              {t("groups-choose-church", { defaultValue: "Choose my church" })}
            </button>
          </div>
        </>
      ) : (
        home.churches.map((c) => (
          <ChurchGroups
            key={c.agent}
            state={state}
            church={c}
            description={descriptions[c.name]}
            busy={busy}
            run={run}
          />
        ))
      )}
      <h3 className="sb-faith-heading">
        {t("groups-own-heading", { defaultValue: "A group of your own" })}
      </h3>
      <p className="sb-faith-hint">
        {t("groups-own-hint", {
          defaultValue:
            "For a group no church lists here, like friends who meet each week.",
        })}
      </p>
      <OwnGroupForm
        busy={busy}
        add={async (name, kind) => {
          setBusy(true);
          try {
            return await faith.addOwnGroup(name, kind);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
