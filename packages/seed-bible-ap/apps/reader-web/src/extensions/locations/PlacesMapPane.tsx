// THE PLACES MAP — the old locations map (a CasualOS portal) as a plain web map: Leaflet over map tiles and place
// geometry the serving plane proxies and caches (the page talks to the workspace's origin only). The places the
// chapter on screen names are drawn; tapping one selects the verse that names it.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { A2A_BASE } from "../../api";
import { placesInChapter, type PlaceData } from "./index";

type Leaflet = typeof import("leaflet");

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

/** The geometry of a place, from the serving plane (null when it has none). */
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
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const chapter = state.reading.chapterData.value;
  const chapterRef = state.reading.chapterRef.value;
  const places = chapter ? placesInChapter(chapter) : [];

  useEffect(() => {
    let dead = false;
    void (async () => {
      const L: Leaflet = await import("leaflet");
      if (dead || !host.current) return;
      if (!mapRef.current) {
        const info = (await fetch(`${A2A_BASE}/api/tiles-info`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) as {
          attribution?: string;
          maxZoom?: number;
        } | null;
        if (dead || !host.current) return;
        const map = L.map(host.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([31.8, 35.2], 7);
        L.tileLayer(`${A2A_BASE}/api/tiles/{z}/{x}/{y}.png`, {
          maxZoom: info?.maxZoom ?? 12,
          attribution: `${info?.attribution ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'} · places: OpenBible.info`,
        }).addTo(map);
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
      <header className="sb-pane-header">
        <h2>{t("places-map", { defaultValue: "Places map" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
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
