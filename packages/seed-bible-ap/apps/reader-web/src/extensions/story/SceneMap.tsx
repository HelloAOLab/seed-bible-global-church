// THE SETTING ON A MAP — a scene's setting (scr:sceneSetting) and the other places its verses name, over the Bible lands
// base map the Places map uses. The setting is drawn larger; a place with a card opens it. A place the knowledge base
// cannot locate is listed, not guessed.
import { useEffect, useRef } from "preact/hooks";
import { retryChunkImport } from "../../sw/retryChunkImport";
import { baseMapLayer } from "../locations/PlacesMapPane";
import type { Located } from "./data";

export function SceneMap(props: {
  places: Array<Located & { setting?: boolean }>;
  dark: boolean;
  lang: string;
  onOpen: (path: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const located = props.places.filter(
    (p) => typeof p.lat === "number" && typeof p.lon === "number"
  );
  const key = located.map((p) => p.id).join();
  useEffect(() => {
    let dead = false;
    void (async () => {
      const L = await retryChunkImport(() => import("leaflet"));
      if (dead || !host.current || !located.length) return;
      mapRef.current?.remove();
      const map = L.map(host.current, { zoomControl: true, maxZoom: 13 });
      mapRef.current = map;
      const bounds = L.latLngBounds([]);
      for (const p of located) {
        const m = L.circleMarker([p.lat!, p.lon!], {
          radius: p.setting ? 9 : 6,
          color: "#b45309",
          fillColor: "#f59e0b",
          fillOpacity: p.setting ? 0.9 : 0.5,
          weight: 2,
        }).addTo(map);
        m.bindTooltip(p.modernName && p.modernName !== p.label ? `${p.label} (${p.modernName})` : p.label);
        if (p.path) m.on("click", () => props.onOpen(p.path!));
        bounds.extend([p.lat!, p.lon!]);
      }
      map.fitBounds(bounds.pad(0.6), { maxZoom: 9 });
      host.current.dataset["drawn"] = located.map((p) => p.label).join("|");
      try {
        (await baseMapLayer(L, null, props.dark, props.lang)).addTo(map);
      } catch {
        /* the places stand on a blank map; the Places map says why the base map is missing */
      }
    })();
    return () => {
      dead = true;
    };
  }, [key, props.dark]);
  useEffect(() => () => mapRef.current?.remove(), []);
  if (!located.length) return null;
  return <div ref={host} className="sb-story-map" />;
}
