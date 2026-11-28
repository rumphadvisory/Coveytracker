"use client";

import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, type Fix } from "@/lib/gps";
import { OFFLINE_MAX_ZOOM, OFFLINE_STYLES } from "@/lib/tiles";
import type { BoundaryShape, GpsMarkRow } from "@/types/database";

export const MARK_COLORS = { covey: "#e76624", contact: "#257de0", me: "#3d6e38", count: "#7a5c2e" } as const;

// Base maps. All free and keyless. Hybrid = satellite with road and place-name overlays;
// Topo = USGS topographic map (US coverage: contours, roads, streams, place names).
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const BASEMAPS = {
  satellite: {
    label: "Satellite",
    layers: [{ url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 19 }],
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
  },
  hybrid: {
    label: "Hybrid",
    layers: [
      { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 19 },
      { url: `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 19 },
      { url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom: 19 },
    ],
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics; roads &amp; labels &copy; Esri",
  },
  topo: {
    label: "Topo",
    layers: [{ url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", maxNativeZoom: 16 }],
    attribution: "USGS The National Map",
  },
} as const;
type BasemapId = keyof typeof BASEMAPS;

const USGS = "USGS The National Map";
type BasemapDef = { attribution: string; layers: readonly { url: string; maxNativeZoom: number }[] };
/** What each choice shows with no signal: the public-domain USGS maps that can be saved offline. */
const OFFLINE_FALLBACK: Record<BasemapId, BasemapDef> = {
  satellite: { attribution: USGS, layers: [{ url: OFFLINE_STYLES.aerial.url, maxNativeZoom: OFFLINE_MAX_ZOOM }] },
  hybrid: { attribution: USGS, layers: [{ url: OFFLINE_STYLES.aerial.url, maxNativeZoom: OFFLINE_MAX_ZOOM }] },
  topo: { attribution: USGS, layers: [{ url: OFFLINE_STYLES.topo.url, maxNativeZoom: OFFLINE_MAX_ZOOM }] },
};

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
const BASEMAP_KEY = "ct:mapLayer";

function readBasemap(): BasemapId {
  try {
    const v = localStorage.getItem(BASEMAP_KEY);
    if (v && v in BASEMAPS) return v as BasemapId;
  } catch {}
  return "satellite";
}

export interface ExtraPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  lines: string[];
}

interface Props {
  marks: GpsMarkRow[];
  courseName: (id: string | null) => string;
  dogName: (id: string | null) => string;
  fix?: Fix | null;
  extraPoints?: ExtraPoint[];
  className?: string;
  /** Changing this re-runs auto-centering (e.g. when a filter or the property changes). */
  fitKey?: string;
  /** The property's saved center. The map opens here (or on the marks), not on the user's GPS. */
  home?: { lat: number; lng: number } | null;
  /** Outlined areas: property parcels, courses, or an imported area being reviewed. */
  areas?: MapArea[];
  /** Corner points of an outline being drawn ([lat, lng]). */
  draft?: [number, number][];
  /** Tap on the map (used for drawing outlines). */
  onMapClick?: (lat: number, lng: number) => void;
  /** Dog GPS tracks (e.g. from Garmin collars), drawn as colored lines under the marks. */
  tracks?: MapTrack[];
  /** Covey / contact legend (not useful on the boundaries screen). */
  showLegend?: boolean;
  /** Extra controls drawn over the map (bottom-left). */
  overlay?: React.ReactNode;
}

export interface MapTrack {
  id: string;
  label: string;
  color: string;
  /** [lat, lng] */
  points: [number, number][];
}

export interface MapArea {
  id: string;
  label: string;
  color: string;
  shapes: BoundaryShape[];
  /** Property outlines are drawn as a heavy line with no fill; courses get a light fill. */
  kind: "property" | "course" | "preview";
}

/** Text label for an area, built with textContent (names are user input). */
function labelNode(text: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  return el;
}

/** Build popup content with textContent only — never innerHTML — to prevent XSS. */
function popupNode(title: string, lines: string[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "ct-popup";
  const strong = document.createElement("strong");
  strong.textContent = title;
  root.appendChild(strong);
  for (const line of lines) {
    const div = document.createElement("div");
    div.textContent = line;
    root.appendChild(div);
  }
  return root;
}

export default function MapView({
  marks,
  courseName,
  dogName,
  fix,
  extraPoints = [],
  className = "",
  fitKey,
  home,
  areas = [],
  draft,
  onMapClick,
  tracks = [],
  showLegend = true,
  overlay,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const marksLayer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.CircleMarker | null>(null);
  const fittedFor = useRef<string | null>(null);
  const readyRef = useRef(false);
  const baseLayer = useRef<L.LayerGroup | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>("satellite");
  const [offline, setOffline] = useState(false);
  const basemapRef = useRef<BasemapId>("satellite");
  basemapRef.current = basemap;

  // Swap to saved USGS maps when signal drops, and back when it returns.
  useEffect(() => {
    const update = () => {
      const off = isOffline();
      setOffline(off);
      showBasemap(basemapRef.current, off);
    };
    setOffline(isOffline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const latest = useRef({ marks, fix, extraPoints, courseName, dogName, fitKey, home, areas, draft, onMapClick, tracks });
  latest.current = { marks, fix, extraPoints, courseName, dogName, fitKey, home, areas, draft, onMapClick, tracks };
  const pointsRef = useRef<L.LatLngExpression[]>([]);
  const areaPointsRef = useRef<L.LatLngExpression[]>([]);
  const areasLayer = useRef<L.LayerGroup | null>(null);

  // Draw / redraw everything from latest props.
  const draw = () => {
    const Lf = leafletRef.current;
    const map = mapRef.current;
    if (!Lf || !map || !marksLayer.current) return;
    const { marks, fix, extraPoints, courseName, dogName, fitKey, home, areas, draft, tracks } = latest.current;

    // Outlined areas, under the marks.
    const areaPts: L.LatLngExpression[] = [];
    if (areasLayer.current) {
      areasLayer.current.clearLayers();
      for (const a of areas) {
        for (const shp of a.shapes) {
          const rings = shp.rings.map((r) => r.map(([lng, lat]) => [lat, lng] as [number, number]));
          rings[0]?.forEach((p) => areaPts.push(p));
          const poly = Lf.polygon(rings, {
            color: a.color,
            weight: a.kind === "property" ? 4 : 2.5,
            dashArray: a.kind === "preview" ? "8 6" : undefined,
            fillColor: a.color,
            fillOpacity: a.kind === "property" ? 0 : 0.12,
            interactive: false,
          }).addTo(areasLayer.current);
          if (a.kind !== "property" || a.shapes.length > 1)
            poly.bindTooltip(labelNode(a.kind === "property" ? shp.name : a.label), {
              permanent: true,
              direction: "center",
              className: "ct-area-label",
            });
        }
      }
      // Dog tracks: a dark casing under a bright line so they read on satellite and topo alike.
      for (const t of tracks) {
        if (t.points.length < 2) continue;
        Lf.polyline(t.points, { color: "#1f1d1a", weight: 6, opacity: 0.55, interactive: false }).addTo(areasLayer.current);
        Lf.polyline(t.points, { color: t.color, weight: 3, opacity: 0.95, interactive: false }).addTo(areasLayer.current);
        Lf.circleMarker(t.points[0], { radius: 4, color: "#fff", weight: 2, fillColor: t.color, fillOpacity: 1, interactive: false }).addTo(areasLayer.current);
        Lf.circleMarker(t.points[t.points.length - 1], { radius: 5, color: "#1f1d1a", weight: 2, fillColor: t.color, fillOpacity: 1 })
          .bindTooltip(labelNode(t.label), { permanent: true, direction: "right", className: "ct-area-label" })
          .addTo(areasLayer.current);
        t.points.forEach((p) => areaPts.push(p));
      }
      if (draft?.length) {
        Lf.polyline(draft.length > 2 ? [...draft, draft[0]] : draft, { color: "#e76624", weight: 3, dashArray: "6 6" }).addTo(
          areasLayer.current,
        );
        for (const p of draft)
          Lf.circleMarker(p, { radius: 6, color: "#fff", weight: 2, fillColor: "#e76624", fillOpacity: 1 }).addTo(
            areasLayer.current,
          );
      }
    }
    areaPointsRef.current = areaPts;

    marksLayer.current.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const m of marks) {
      const color = m.type === "covey" ? MARK_COLORS.covey : MARK_COLORS.contact;
      const lines = [
        ...(m.type === "contact" ? [`Dog: ${dogName(m.dog_id)}`] : []),
        `Course: ${courseName(m.course_id)}`,
        new Date(m.timestamp).toLocaleString(),
        ...(m.notes ? [m.notes] : []),
      ];
      Lf.circleMarker([m.lat, m.lng], { radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.95 })
        .bindPopup(popupNode(m.type === "covey" ? "Covey find" : "Dog contact", lines))
        .addTo(marksLayer.current);
      pts.push([m.lat, m.lng]);
    }
    for (const p of extraPoints) {
      Lf.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: MARK_COLORS.count,
        fillOpacity: 0.95,
      })
        .bindPopup(popupNode(p.title, p.lines))
        .addTo(marksLayer.current);
      pts.push([p.lat, p.lng]);
    }

    if (fix) {
      if (!meLayer.current) {
        meLayer.current = Lf.circleMarker([fix.lat, fix.lng], {
          radius: 8,
          color: "#fff",
          weight: 4,
          fillColor: MARK_COLORS.me,
          fillOpacity: 1,
        })
          .bindPopup(popupNode("You are here", [`±${Math.round(fix.accuracy)} m`]))
          .addTo(map);
      } else {
        meLayer.current.setLatLng([fix.lat, fix.lng]);
      }
    }

    pointsRef.current = pts;
    // Auto-center once per fitKey on the property: its marks, else its saved center.
    // Only fall back to the user's GPS when the property has no location set.
    const key = fitKey ?? "default";
    if (fittedFor.current !== key) {
      if (pts.length > 0 || areaPts.length > 0 || home) {
        centerOnProperty();
        fittedFor.current = key;
      } else if (fix) {
        map.setView([fix.lat, fix.lng], 16);
        fittedFor.current = key;
      } else {
        map.setView(DEFAULT_CENTER, 11);
      }
    }
  };

  /** Fit the property's marks, or center on its saved location. */
  function centerOnProperty() {
    const Lf = leafletRef.current;
    const map = mapRef.current;
    if (!Lf || !map) return;
    // Outlines first: they define the property. Marks and the saved center are included too.
    const pts = [...areaPointsRef.current, ...pointsRef.current];
    const { home } = latest.current;
    if (pts.length > 0) {
      const b = Lf.latLngBounds(pts);
      if (home) b.extend([home.lat, home.lng]);
      map.fitBounds(b.pad(0.15), { maxZoom: 16 });
    } else if (home) {
      map.setView([home.lat, home.lng], 15);
    }
  }

  function centerOnMe() {
    const { fix } = latest.current;
    if (fix) mapRef.current?.setView([fix.lat, fix.lng], Math.max(mapRef.current.getZoom(), 16));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Lf = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = Lf;
      const map = Lf.map(containerRef.current, { zoomControl: true, attributionControl: true });
      map.setView(DEFAULT_CENTER, 11);
      areasLayer.current = Lf.layerGroup().addTo(map);
      marksLayer.current = Lf.layerGroup().addTo(map);
      map.on("click", (e: L.LeafletMouseEvent) => latest.current.onMapClick?.(e.latlng.lat, e.latlng.lng));
      mapRef.current = map;
      readyRef.current = true;
      const saved = readBasemap();
      setBasemap(saved);
      showBasemap(saved);
      draw();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      marksLayer.current = null;
      areasLayer.current = null;
      meLayer.current = null;
      baseLayer.current = null;
      fittedFor.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showBasemap(id: BasemapId, offline = isOffline()) {
    const Lf = leafletRef.current;
    const map = mapRef.current;
    if (!Lf || !map) return;
    baseLayer.current?.remove();
    // With no signal, use the USGS maps that can be saved on the phone (see OfflineMaps).
    const def = offline ? OFFLINE_FALLBACK[id] : BASEMAPS[id];
    // Layers are added bottom to top (imagery, then roads, then labels). Marks live in
    // Leaflet's overlay pane, which always draws above tiles.
    const group = Lf.layerGroup(
      def.layers.map((l, i) =>
        Lf.tileLayer(l.url, { maxZoom: 19, maxNativeZoom: l.maxNativeZoom, attribution: i === 0 ? def.attribution : undefined }),
      ),
    );
    group.addTo(map);
    baseLayer.current = group;
  }

  function chooseBasemap(id: BasemapId) {
    setBasemap(id);
    showBasemap(id);
    try {
      localStorage.setItem(BASEMAP_KEY, id);
    } catch {}
  }

  useEffect(() => {
    if (readyRef.current) draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, fix, extraPoints, fitKey, courseName, dogName, home, areas, draft, tracks]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      <div
        role="radiogroup"
        aria-label="Map type"
        className="absolute right-3 top-3 z-[500] flex overflow-hidden rounded-xl bg-white/95 text-xs font-semibold shadow"
      >
        {offline && (
          <span className="flex items-center gap-1 bg-ink px-2.5 text-white" title="No signal: showing maps saved on this phone">
            <span className="material-symbols-outlined text-[14px]">cloud_off</span> Offline
          </span>
        )}
        {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={basemap === id}
            onClick={() => chooseBasemap(id)}
            className={`px-3 py-2 ${basemap === id ? "bg-forest text-white" : "text-ink"}`}
          >
            {BASEMAPS[id].label}
          </button>
        ))}
      </div>
      <div className="absolute bottom-8 right-3 z-[500] flex flex-col gap-2">
        {(home || marks.length > 0 || areas.length > 0) && (
          <button
            type="button"
            onClick={centerOnProperty}
            className="flex items-center gap-1 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-ink shadow"
            aria-label="Center on property"
          >
            <span className="material-symbols-outlined text-[18px] text-forest">home_pin</span> Property
          </button>
        )}
        <button
          type="button"
          onClick={centerOnMe}
          disabled={!fix}
          className="flex items-center gap-1 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-ink shadow disabled:opacity-50"
          aria-label="Center on my location"
        >
          <span className="material-symbols-outlined text-[18px] text-forest">my_location</span> Me
        </button>
      </div>
      {overlay && <div className="absolute inset-x-3 bottom-8 z-[600]">{overlay}</div>}
      <div className={`${showLegend ? "" : "hidden"} pointer-events-none absolute bottom-3 left-3 z-[500] rounded-xl bg-white/95 px-3 py-2 text-xs shadow`}>
        {[
          ["Covey find", MARK_COLORS.covey],
          ["Dog contact", MARK_COLORS.contact],
          ...(extraPoints.length ? [["Listening point", MARK_COLORS.count]] : []),
          ["You", MARK_COLORS.me],
        ].map(([label, color]) => (
          <div key={label} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
