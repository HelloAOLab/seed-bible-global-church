// THE PLACES MAP — the old locations map (a CasualOS portal) as a plain web map: Leaflet over the Bible lands base map
// (a signed map work on the publishing gateway, vector tiles drawn here in the reader's light or dark) and place
// geometry from the scripture agent, both relayed by the workspace (the page talks to its origin only). The places the
// chapter on screen names are drawn; tapping one selects the verse that names it.
import { useEffect, useRef, useState } from "preact/hooks";
import { retryChunkImport } from "../../sw/retryChunkImport";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { A2A_BASE } from "../../api";
import { placesInChapter, type PlaceData } from "./index";

type Leaflet = typeof import("leaflet");

/** What `/api/tiles-info` says about the published base map. */
interface TilesInfo {
  attribution?: string;
  maxZoom?: number;
}

const OSM_CREDIT =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const PLACES_CREDIT =
  "places: OpenBible.info (CC BY 4.0), Theographic (CC BY-SA 4.0)";

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

/**
 * OpenBible's geometry export writes coordinates as strings in [lat, lon] order; GeoJSON is numbers in [lon, lat].
 * A pair that arrives as strings is that export and is turned round; numbers are taken as standard.
 */
export function normalizeGeometry<T>(value: T): T {
  if (Array.isArray(value)) {
    if (
      value.length >= 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    )
      return [Number(value[1]), Number(value[0])] as unknown as T;
    return value.map((v) => normalizeGeometry(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = normalizeGeometry(v);
    return out as T;
  }
  return value;
}

/** The geometry of a place, from the scripture agent through this reader's agent (null when it has none). */
export async function loadPlaceGeometry(
  place: PlaceData,
  fetchImpl: typeof fetch = fetch
): Promise<GeoJSON.GeoJsonObject | null> {
  const res = await fetchImpl(
    `${A2A_BASE}/api/places/${encodeURIComponent(place.geojson)}`
  );
  if (!res.ok) return null;
  const raw = (await res
    .json()
    .catch(() => null)) as GeoJSON.GeoJsonObject | null;
  return raw ? normalizeGeometry(raw) : null;
}

export function PlacesMapPane({ state }: { state: ReaderState }) {
  const { t, language } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const baseRef = useRef<import("leaflet").Layer | null>(null);
  const infoRef = useRef<TilesInfo | null>(null);
  const dark = state.settings.resolvedTheme().id === "dark";
  const [status, setStatus] = useState<string | null>(null);
  const chapter = state.reading.chapterData.value;
  const chapterRef = state.reading.chapterRef.value;
  const places = chapter ? placesInChapter(chapter) : [];

  useEffect(() => {
    let dead = false;
    void (async () => {
      const L: Leaflet = await retryChunkImport(() => import("leaflet"));
      if (dead || !host.current) return;
      if (!mapRef.current) {
        const info = (await fetch(`${A2A_BASE}/api/tiles-info`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as TilesInfo | null;
        infoRef.current = info;
        if (dead || !host.current) return;
        const map = L.map(host.current, {
          zoomControl: true,
          attributionControl: true,
          maxZoom: 13,
        }).setView([31.8, 35.2], 7);
        const base = await baseMapLayer(L, info, dark, language);
        if (dead) return;
        base.addTo(map);
        baseRef.current = base;
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
      }
      const map = mapRef.current;
      const layer = layerRef.current!;
      layer.clearLayers();
      if (!places.length) {
        setStatus(
          t("places-none", {
            defaultValue: "This chapter names no place the map knows.",
          })
        );
        return;
      }
      setStatus(t("places-loading", { defaultValue: "Finding the places…" }));
      const bounds = L.latLngBounds([]);
      let drawn = 0;
      for (const { place, verse } of places) {
        const geo = await loadPlaceGeometry(place);
        if (dead) return;
        if (!geo) continue;
        const g = L.geoJSON(geo, {
          pointToLayer: (_f, latlng) =>
            L.circleMarker(latlng, {
              radius: 7,
              color: "#b45309",
              fillColor: "#f59e0b",
              fillOpacity: 0.9,
              weight: 2,
            }),
          style: () => ({ color: "#b45309", weight: 2, fillOpacity: 0.15 }),
        });
        g.bindTooltip(
          `${place.place} · ${t("verse", { defaultValue: "verse" })} ${verse}`
        );
        g.on("click", () => state.selection.select(verse, verse));
        g.addTo(layer);
        bounds.extend(g.getBounds());
        drawn++;
      }
      if (drawn) {
        map.fitBounds(bounds.pad(0.3), { maxZoom: 9 });
        setStatus(null);
      } else
        setStatus(
          t("places-no-geometry", {
            defaultValue: "The map has no geometry for these places yet.",
          })
        );
    })();
    return () => {
      dead = true;
    };
  }, [chapterRef]);

  // A theme change redraws the base map in the other flavour; the places on it stay.
  useEffect(() => {
    const map = mapRef.current;
    const old = baseRef.current;
    if (!map || !old) return;
    let dead = false;
    void (async () => {
      const L: Leaflet = await retryChunkImport(() => import("leaflet"));
      const base = await baseMapLayer(L, infoRef.current, dark, language);
      if (dead || mapRef.current !== map) return;
      map.removeLayer(old);
      base.addTo(map);
      (base as import("leaflet").GridLayer).bringToBack?.();
      baseRef.current = base;
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
      {places.length > 0 && (
        <ul className="sb-places-list">
          {places.map(({ place, verse }) => (
            <li key={place.place}>
              <button
                type="button"
                className="sb-presence-where"
                onClick={() => state.selection.select(verse, verse)}
              >
                {place.place}
              </button>{" "}
              <span className="sb-small sb-muted">· {verse}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
