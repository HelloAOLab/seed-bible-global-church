// SETTINGS → MY CHURCH (ap-church spec 203): the churches are FaithNet's `.church` names, the sites are what the chosen
// church says of itself, and the choice is kept by the reader's own agent — the record the Church app reads too.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { ChurchDescription, ChurchSite } from "../../state/faith/faith";

const ALL_SITES = "all";

const siteAddress = (s: ChurchSite) =>
  [
    s.address?.streetAddress,
    [s.address?.addressLocality, s.address?.addressRegion]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

const siteServices = (s: ChurchSite) => {
  const byDay = new Map<string, string[]>();
  for (const v of s.services ?? [])
    byDay.set(v.day, [...(byDay.get(v.day) ?? []), v.time]);
  return [...byDay].map(([d, ts]) => `${d} ${ts.join(", ")}`).join(" · ");
};

export function MyChurchCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { faith } = state;
  const signedIn = !!state.session.value;
  const home = faith.churchHome.value;
  const current =
    home.churches.find((c) => c.agent === home.defaultChurch) ??
    home.churches[0];
  /** A church chosen in the dropdown and not saved yet (a multi-site church waits for its site). */
  const [picked, setPicked] = useState<string | null>(null);
  const [description, setDescription] = useState<ChurchDescription | null>(
    null
  );
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = picked ?? current?.name ?? "";

  useEffect(() => {
    if (!signedIn) return;
    void faith.refresh();
    void faith.loadDirectory();
  }, [signedIn]);

  const save = (d: ChurchDescription, site: string | null) => {
    setBusy(true);
    setSaved(false);
    void faith
      .chooseChurch({ agent: d.church.agent, name: d.church.name }, site)
      .then((ok) => {
        setBusy(false);
        if (!ok) return;
        setPicked(null);
        setSaved(true);
      });
  };

  useEffect(() => {
    setDescription(null);
    if (!signedIn || !name) return;
    let live = true;
    void faith.describeChurch(name).then((d) => {
      if (!live || !d) return;
      setDescription(d);
      // One place or none: there is no site to ask about, so choosing the church is the whole choice.
      if (picked === name && d.sites.length <= 1)
        save(d, d.sites[0]?.id ?? null);
    });
    return () => {
      live = false;
    };
  }, [name, signedIn]);

  if (!signedIn)
    return (
      <div className="sb-account-card">
        <p className="sb-faith-hint">
          {t("my-church-sign-in", {
            defaultValue: "Sign in to choose your church.",
          })}
        </p>
      </div>
    );

  const churches = faith.directory.value;
  const sites = description?.sites ?? [];
  // A saved church always shows its saved site, "All sites" included, so the choice is never out of sight.
  const siteValue = picked
    ? ""
    : current?.site
      ? current.site.id
      : current
        ? ALL_SITES
        : "";
  const site = sites.find((s) => s.id === siteValue);
  const error = faith.message.value?.error ? faith.message.value.text : null;

  return (
    <div className="sb-account-card sb-my-church">
      <p className="sb-faith-hint">
        {t("my-church-hint", {
          defaultValue:
            "Your own agent keeps this, so every device and the Church app show the same church and site.",
        })}
      </p>
      <label htmlFor="my-church-select">
        {t("my-church-church", { defaultValue: "Church" })}
      </label>
      <select
        id="my-church-select"
        value={name}
        disabled={churches === null || busy}
        onChange={(e) => {
          setSaved(false);
          const v = (e.target as HTMLSelectElement).value;
          setPicked(v === current?.name ? null : v);
        }}
      >
        <option value="" disabled>
          {churches === null
            ? t("loading", { defaultValue: "Loading…" })
            : t("my-church-choose", { defaultValue: "Choose your church" })}
        </option>
        {/* The saved church stays listed even if the naming service is out of reach just now. */}
        {current && !churches?.some((c) => c.name === current.name) && (
          <option value={current.name}>
            {current.displayName ?? current.name}
          </option>
        )}
        {churches?.map((c) => (
          <option key={c.agent} value={c.name} disabled={!c.describable}>
            {c.displayName}
          </option>
        ))}
      </select>
      {sites.length > 1 && (
        <>
          <label htmlFor="my-church-site">
            {t("my-church-site", { defaultValue: "Site" })}
          </label>
          <select
            id="my-church-site"
            value={siteValue}
            disabled={busy}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v) save(description!, v === ALL_SITES ? null : v);
            }}
          >
            <option value="" disabled>
              {t("my-church-choose-site", {
                defaultValue: "Choose your site",
              })}
            </option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value={ALL_SITES}>
              {t("faith-all-sites", { defaultValue: "All sites" })}
            </option>
          </select>
        </>
      )}
      {site && (siteAddress(site) || siteServices(site)) && (
        <p className="sb-faith-site-detail">
          {[siteAddress(site), siteServices(site)].filter(Boolean).join(" · ")}
        </p>
      )}
      {description?.church.website && (
        <a
          className="sb-small"
          href={description.church.website}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("my-church-website", { defaultValue: "Church website" })}
        </a>
      )}
      <p className="sb-faith-message" role="status" aria-live="polite">
        {error ??
          (saved ? t("my-church-saved", { defaultValue: "Saved." }) : "")}
      </p>
    </div>
  );
}
