// THE PLACES MAP — the old locations map (a CasualOS portal) as a plain web map: Leaflet over the Bible lands base map
// (a signed map work on the publishing gateway, vector tiles drawn here in the reader's light or dark) and the chapter's
// places from the publishers (the scripture publisher's Bible places and any published map features), all through the
// workspace (the page talks to its origin only). A place whose site is uncertain is drawn hollow and dashed and says so;
// tapping a place selects the first verse of the chapter that names it. The places never wait for the base map: they
// are drawn as soon as the map exists, and a base map that cannot be loaded is said so under the map, with Reload.
import { useEffect, useRef, useState } from "preact/hooks";
import { retryChunkImport } from "../../sw/retryChunkImport";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { A2A_BASE } from "../../api";
import { loadChapterPlaces, siteUncertain, type ChapterPlace } from "./index";

type Leaflet = typeof import("leaflet");

/** What `/api/tiles-info` says about the published base map. */
interface TilesInfo {
  attribution?: string;
  maxZoom?: number;
}

const OSM_CREDIT =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const PLACES_CREDIT = "places: OpenBible.info (CC BY 4.0)";
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The base map layer: the published map's vector tiles, drawn in the page. */
async function baseMapLayer(
  L: Leaflet,
  info: TilesInfo | null,
  dark: boolean,
  lang: string
): Promise<import("leaflet").Layer> {
  // protomaps-leaflet subclasses the global `L.GridLayer` when a layer is made.
  (globalThis as unknown as { L?: Leaflet }).L = L;
  const { leafletLayer } = await retryChunkImport(
    () => import("protomaps-leaflet")
  );
  return leafletLayer({
    url: `${A2A_BASE}/api/tiles/{z}/{x}/{y}.mvt`,
    flavor: dark ? "dark" : "light",
    lang: lang.split("-")[0] || "en",
    maxDataZoom: info?.maxZoom ?? 10,
    attribution: `${info?.attribution ?? OSM_CREDIT} · ${PLACES_CREDIT}`,
  }) as unknown as import("leaflet").Layer;
}

const reason = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

export function PlacesMapPane({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const baseRef = useRef<import("leaflet").Layer | null>(null);
  const infoRef = useRef<TilesInfo | null>(null);
  const dark = state.settings.resolvedTheme().id === "dark";
  const [status, setStatus] = useState<string | null>(null);
  // The base map's own trouble, apart from the places': null while loading or loaded, else why it is not there.
  const [baseProblem, setBaseProblem] = useState<string | null>(null);
  const chapterRef = state.reading.chapterRef.value;
  // The places are asked for by the chapter's ref, so they always belong to the chapter on screen; null while asking.
  const [loaded, setLoaded] = useState<{
    ref: string;
    places: ChapterPlace[];
  } | null>(null);
  useEffect(() => {
    let dead = false;
    setLoaded(null);
    void loadChapterPlaces(chapterRef).then((places) => {
      if (!dead) setLoaded({ ref: chapterRef, places });
    });
    return () => {
      dead = true;
    };
  }, [chapterRef]);
  const places = loaded?.ref === chapterRef ? loaded.places : null;

  /** Puts the base map under `map` (replacing `old` when given); a failure leaves the places on a blank map and says so. */
  async function loadBase(
    L: Leaflet,
    map: import("leaflet").Map,
    old: import("leaflet").Layer | null
  ): Promise<void> {
    try {
      if (!infoRef.current)
        infoRef.current = (await fetch(`${A2A_BASE}/api/tiles-info`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as TilesInfo | null;
      const base = await baseMapLayer(L, infoRef.current, dark, language);
      if (mapRef.current !== map) return;
      if (old) map.removeLayer(old);
      base.addTo(map);
      (base as import("leaflet").GridLayer).bringToBack?.();
      baseRef.current = base;
      setBaseProblem(null);
    } catch (err) {
      if (mapRef.current !== map) return;
      if (!baseRef.current)
        map.attributionControl.addAttribution(PLACES_CREDIT);
      setBaseProblem(reason(err));
    }
  }

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const L: Leaflet = await retryChunkImport(() => import("leaflet"));
        if (dead || !host.current) return;
        if (!mapRef.current) {
          const map = L.map(host.current, {
            zoomControl: true,
            attributionControl: true,
            maxZoom: 13,
          }).setView([31.8, 35.2], 7);
          mapRef.current = map;
          layerRef.current = L.layerGroup().addTo(map);
          void loadBase(L, map, null);
        }
        const map = mapRef.current;
        const layer = layerRef.current!;
        layer.clearLayers();
        // What is drawn, for anyone checking the map against the chapter (flow X8).
        host.current.dataset["drawn"] = "";
        if (!places) {
          setStatus(
            t("places-loading", { defaultValue: "Finding the places…" })
          );
          return;
        }
        if (!places.length) {
          setStatus(
            t("places-none", {
              defaultValue: "This chapter names no place the map knows.",
            })
          );
          return;
        }
        const bounds = L.latLngBounds([]);
        const drawn: string[] = [];
        for (const p of places) {
          const uncertain = siteUncertain(p);
          const g = L.geoJSON(
            {
              type: "Feature",
              geometry: p.geometry,
              properties: {},
            } as GeoJSON.Feature,
            {
              pointToLayer: (_f, latlng) =>
                L.circleMarker(latlng, {
                  radius: 7,
                  color: "#b45309",
                  fillColor: "#f59e0b",
                  fillOpacity: uncertain ? 0.15 : 0.9,
                  weight: 2,
                  dashArray: uncertain ? "3 3" : undefined,
                }),
              style: () => ({
                color: "#b45309",
                weight: 2,
                fillOpacity: 0.15,
                dashArray: uncertain ? "4 4" : undefined,
              }),
            }
          );
          const where = `${t("verse", { defaultValue: "verse" })} ${p.verses.join(", ")}`;
          g.bindTooltip(
            uncertain
              ? `${p.name} · ${where} · ${t("places-site-uncertain", { defaultValue: "site uncertain" })}`
              : `${p.name} · ${where}`
          );
          // What the publisher said of the place beyond its name — a group's picture, period and summary — opens on tap.
          if (p.summary || p.image)
            g.bindPopup(
              `<div class="sb-places-popup">${
                p.image
                  ? `<img class="sb-places-popup-image" src="${escapeHtml(p.image)}" alt="" loading="lazy">`
                  : ""
              }<strong>${escapeHtml(p.name)}</strong>${
                p.period
                  ? `<div class="sb-small sb-muted">${escapeHtml(p.period)}</div>`
                  : ""
              }${p.summary ? `<p class="sb-small">${escapeHtml(p.summary)}</p>` : ""}</div>`,
              { maxWidth: 320 }
            );
          g.on("click", () =>
            state.selection.select(p.verses[0]!, p.verses[0]!)
          );
          g.addTo(layer);
          bounds.extend(g.getBounds());
          drawn.push(p.name);
        }
        if (host.current) host.current.dataset["drawn"] = drawn.join(",");
        if (drawn.length) {
          map.fitBounds(bounds.pad(0.3), { maxZoom: 9 });
          setStatus(null);
        } else
          setStatus(
            t("places-no-geometry", {
              defaultValue: "The map has no geometry for these places yet.",
            })
          );
      } catch (err) {
        if (dead) return;
        setStatus(
          t("places-failed", {
            defaultValue: "The map could not be drawn: {{reason}}",
            reason: reason(err),
          })
        );
      }
    })();
    return () => {
      dead = true;
    };
  }, [chapterRef, places]);

  // A theme change redraws the base map in the other flavour; the places on it stay. A base map that failed before
  // is tried again here.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let dead = false;
    void (async () => {
      const L: Leaflet = await retryChunkImport(() => import("leaflet"));
      if (dead) return;
      await loadBase(L, map, baseRef.current);
    })();
    return () => {
      dead = true;
    };
  }, [dark, language]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    []
  );

  return (
    <section
      className="sb-pane sb-places-map"
      aria-label={t("places-map", { defaultValue: "Places map" })}
    >
      <div className="sb-places-map-canvas" ref={host} />
      {status && <p className="sb-small sb-muted">{status}</p>}
      {baseProblem && (
        <p className="sb-small sb-muted sb-places-base-problem">
          {t("places-base-map-failed", {
            defaultValue:
              "The base map could not be loaded, so the places are drawn on a blank map. Reloading the page may bring it back.",
          })}{" "}
          <span title={baseProblem}>
            <button
              type="button"
              className="sb-presence-where"
              onClick={() => location.reload()}
            >
              {t("reload", { defaultValue: "Reload" })}
            </button>
          </span>
        </p>
      )}
      {places && places.length > 0 && (
        <ul className="sb-places-list">
          {places.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="sb-presence-where"
                onClick={() =>
                  state.selection.select(p.verses[0]!, p.verses[0]!)
                }
              >
                {p.name}
              </button>{" "}
              <span className="sb-small sb-muted">· {p.verses.join(", ")}</span>
              {siteUncertain(p) && (
                <span
                  className="sb-small sb-muted"
                  title={p.identification.basis ?? ""}
                >
                  {" "}
                  ·{" "}
                  {t("places-site-uncertain", {
                    defaultValue: "site uncertain",
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
