"use client";

import { useEffect, useRef } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, type Fix } from "@/lib/gps";
import type { GpsMarkRow } from "@/types/database";

export const MARK_COLORS = { covey: "#e76624", contact: "#257de0", me: "#3d6e38", count: "#7a5c2e" } as const;

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
  /** Changing this re-runs auto-centering (e.g. when a filter changes). */
  fitKey?: string;
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

export default function MapView({ marks, courseName, dogName, fix, extraPoints = [], className = "", fitKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const leafletRef = useRef<typeof L | null>(null);
  const marksLayer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.CircleMarker | null>(null);
  const fittedFor = useRef<string | null>(null);
  const readyRef = useRef(false);
  const latest = useRef({ marks, fix, extraPoints, courseName, dogName, fitKey });
  latest.current = { marks, fix, extraPoints, courseName, dogName, fitKey };

  // Draw / redraw everything from latest props.
  const draw = () => {
    const Lf = leafletRef.current;
    const map = mapRef.current;
    if (!Lf || !map || !marksLayer.current) return;
    const { marks, fix, extraPoints, courseName, dogName, fitKey } = latest.current;

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

    // Auto-center once per fitKey: marks → bounds, else GPS fix, else default.
    const key = fitKey ?? "default";
    if (fittedFor.current !== key) {
      if (pts.length > 0) {
        const b = Lf.latLngBounds(pts);
        map.fitBounds(b.pad(0.15), { maxZoom: 17 });
        fittedFor.current = key;
      } else if (fix) {
        map.setView([fix.lat, fix.lng], 16);
        fittedFor.current = key;
      } else {
        map.setView(DEFAULT_CENTER, 11);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Lf = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = Lf;
      const map = Lf.map(containerRef.current, { zoomControl: true, attributionControl: true });
      Lf.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      }).addTo(map);
      map.setView(DEFAULT_CENTER, 11);
      marksLayer.current = Lf.layerGroup().addTo(map);
      mapRef.current = map;
      readyRef.current = true;
      draw();
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      marksLayer.current = null;
      meLayer.current = null;
      fittedFor.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (readyRef.current) draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, fix, extraPoints, fitKey, courseName, dogName]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-xl bg-white/95 px-3 py-2 text-xs shadow">
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
