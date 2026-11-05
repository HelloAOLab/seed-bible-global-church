// MORE → CHURCH (ap-church spec 203): the reader's church and site, and any other churches they go to. The same card
// as Settings → My church, with the other churches listed under it. All of it is one record their own agent keeps.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { ChurchDescription, ChurchHome } from "../../state/faith/faith";
import { MyChurchCard } from "./MyChurchCard";

const ALL_SITES = "all";
type Chosen = ChurchHome["churches"][number];

function OtherChurch({
  state,
  church,
  busy,
  run,
}: {
  state: ReaderState;
  church: Chosen;
  busy: boolean;
  run: (act: () => Promise<boolean>) => void;
}) {
  const { t } = useI18n();
  const { faith } = state;
  const name = church.displayName ?? church.name;
  const [description, setDescription] = useState<ChurchDescription | null>(
    null
  );
  useEffect(() => {
    let live = true;
    void faith.describeChurch(church.name).then((d) => {
      if (live) setDescription(d);
    });
    return () => {
      live = false;
    };
  }, [church.name]);
  const sites = description?.sites ?? [];
  return (
    <li className="sb-faith-card">
      <div className="sb-faith-card-main">
        <p className="sb-faith-card-title">{name}</p>
        {sites.length > 1 ? (
          <label className="sb-church-site-label">
            {t("church-site-at", {
              church: name,
              defaultValue: `Site at ${name}`,
            })}
            <select
              value={church.site?.id ?? ALL_SITES}
              disabled={busy}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                run(() => faith.addChurch(church, v === ALL_SITES ? null : v));
              }}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={ALL_SITES}>
                {t("faith-all-sites", { defaultValue: "All sites" })}
              </option>
            </select>
          </label>
        ) : (
          church.site && <p className="sb-faith-card-sub">{church.site.name}</p>
        )}
      </div>
      <div className="sb-faith-card-actions">
        <button
          type="button"
          className="sb-faith-button"
          disabled={busy}
          aria-label={t("church-make-main-named", {
            church: name,
            defaultValue: `Make ${name} my main church`,
          })}
          onClick={() =>
            run(() => faith.chooseChurch(church, church.site?.id ?? null))
          }
        >
          {t("church-make-main", { defaultValue: "Make my main church" })}
        </button>
        <button
          type="button"
          className="sb-faith-button sb-faith-button-quiet"
          disabled={busy}
          aria-label={t("church-remove-named", {
            church: name,
            defaultValue: `Remove ${name}`,
          })}
          onClick={() => run(() => faith.removeChurch(church.agent))}
        >
          {t("remove", { defaultValue: "Remove" })}
        </button>
      </div>
    </li>
  );
}

export function ChurchTab({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { faith } = state;
  const home = faith.churchHome.value;
  const [busy, setBusy] = useState(false);
  const run = (act: () => Promise<boolean>) => {
    setBusy(true);
    void act().finally(() => setBusy(false));
  };
  const main =
    home.churches.find((c) => c.agent === home.defaultChurch) ??
    home.churches[0];
  const others = home.churches.filter((c) => c.agent !== main?.agent);
  const addable = (faith.directory.value ?? []).filter(
    (c) => c.describable && !home.churches.some((h) => h.agent === c.agent)
  );
  const add = (name: string) => {
    const church = addable.find((c) => c.name === name);
    if (!church) return;
    run(async () => {
      const d = await faith.describeChurch(name);
      if (!d) return false;
      // One place or none is the whole choice; several start as all sites and the site can be picked in the row.
      return faith.addChurch(
        church,
        d.sites.length === 1 ? d.sites[0]!.id : null
      );
    });
  };
  return (
    <div className="sb-faith-tab">
      <h3 className="sb-faith-heading">
        {t("my-church", { defaultValue: "My church" })}
      </h3>
      <MyChurchCard state={state} />
      {main && (
        <>
          <h3 className="sb-faith-heading">
            {t("church-others", { defaultValue: "Other churches I go to" })}
          </h3>
          <p className="sb-faith-hint">
            {t("church-others-hint", {
              defaultValue:
                "If you are part of more than one church, add the others here. Their groups show under Groups, and a care request can go to any of them.",
            })}
          </p>
          {others.length > 0 && (
            <ul
              className="sb-faith-list"
              aria-label={t("church-others", {
                defaultValue: "Other churches I go to",
              })}
            >
              {others.map((c) => (
                <OtherChurch
                  key={c.agent}
                  state={state}
                  church={c}
                  busy={busy}
                  run={run}
                />
              ))}
            </ul>
          )}
          {addable.length > 0 ? (
            <div className="sb-my-church">
              <label htmlFor="church-add-other">
                {t("church-add-other", { defaultValue: "Add another church" })}
              </label>
              <select
                id="church-add-other"
                value=""
                disabled={busy}
                onChange={(e) => add((e.target as HTMLSelectElement).value)}
              >
                <option value="" disabled>
                  {t("church-add-other-choose", {
                    defaultValue: "Choose a church to add",
                  })}
                </option>
                {addable.map((c) => (
                  <option key={c.agent} value={c.name}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            others.length === 0 && (
              <p className="sb-faith-empty">
                {t("church-no-others", {
                  defaultValue: "There are no other churches to add yet.",
                })}
              </p>
            )
          )}
          <div className="sb-faith-card-actions">
            <button
              type="button"
              className="sb-faith-button"
              onClick={() => (state.ui.faithTab.value = "groups")}
            >
              {t("church-see-groups", { defaultValue: "See my groups" })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
