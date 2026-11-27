// Boundaries: reading outlines from the files people already have (KML/KMZ from Google Earth
// or onX, GPX from Garmin, GeoJSON from surveyors/GIS, or a pasted list of points), plus the
// geometry the app needs (acres, point-in-area, bounding boxes).
//
// Pure functions on strings so they can be unit tested; KMZ unzipping happens in the browser
// loader (lib/boundaryFiles.ts).
import { parsePair } from "./coords.ts";
import type { BoundaryShape, LngLat } from "../types/database";

export type { BoundaryShape, LngLat };

const SQ_M_PER_ACRE = 4046.8564224;
const EARTH_R = 6_378_137;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Signed area of one ring on the sphere, in m² (Chamberlain & Duquette). */
function ringArea(ring: LngLat[]): number {
  let a = 0;
  const n = ring.length;
  if (n < 3) return 0;
  for (let i = 0; i < n; i++) {
    const [l1, p1] = ring[i];
    const [l2, p2] = ring[(i + 1) % n];
    a += ((l2 - l1) * Math.PI) / 180 * (2 + Math.sin((p1 * Math.PI) / 180) + Math.sin((p2 * Math.PI) / 180));
  }
  return (a * EARTH_R * EARTH_R) / 2;
}

export function shapeAcres(shape: BoundaryShape): number {
  const [outer, ...holes] = shape.rings;
  if (!outer) return 0;
  const m2 = Math.abs(ringArea(outer)) - holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
  return Math.max(0, m2) / SQ_M_PER_ACRE;
}

export function totalAcres(shapes: BoundaryShape[] | null | undefined): number {
  return (shapes ?? []).reduce((s, x) => s + shapeAcres(x), 0);
}

function inRing(lng: number, lat: number, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is the point inside any of the areas (outline minus holes)? */
export function containsPoint(shapes: BoundaryShape[] | null | undefined, lat: number, lng: number): boolean {
  return (shapes ?? []).some((s) => {
    const [outer, ...holes] = s.rings;
    return !!outer && inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h));
  });
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function shapesBounds(shapes: BoundaryShape[] | null | undefined): Bounds | null {
  let b: Bounds | null = null;
  for (const s of shapes ?? [])
    for (const [lng, lat] of s.rings[0] ?? []) {
      if (!b) b = { south: lat, north: lat, west: lng, east: lng };
      else {
        b.south = Math.min(b.south, lat);
        b.north = Math.max(b.north, lat);
        b.west = Math.min(b.west, lng);
        b.east = Math.max(b.east, lng);
      }
    }
  return b;
}

/** Grow a box by `miles` on every side. */
export function padBounds(b: Bounds, miles: number): Bounds {
  const dLat = (miles * 1609.344) / 111_320;
  const dLng = dLat / Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
  return { south: b.south - dLat, north: b.north + dLat, west: b.west - dLng, east: b.east + dLng };
}

export function boundsCenter(b: Bounds): { lat: number; lng: number } {
  return { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
}

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

const valid = ([lng, lat]: LngLat) =>
  Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Drop bad and repeated points and the closing duplicate; a ring needs 3+ distinct points. */
export function cleanRing(points: LngLat[]): LngLat[] | null {
  const out: LngLat[] = [];
  for (const p of points.filter(valid)) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([+p[0].toFixed(7), +p[1].toFixed(7)]);
  }
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out.length >= 3 ? out : null;
}

function shape(name: string, rings: LngLat[][]): BoundaryShape | null {
  const cleaned = rings.map(cleanRing);
  if (!cleaned[0]) return null;
  return { name: name.trim() || "Unnamed area", rings: cleaned.filter((r): r is LngLat[] => !!r) };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"));
  return m ? decodeXml(m[1]) : null;
}

function tags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "gi"))].map((m) => m[1]);
}

/** KML "lng,lat[,alt] lng,lat[,alt] …" */
function kmlCoords(text: string): LngLat[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.split(",").map(Number))
    .filter((p) => p.length >= 2)
    .map((p) => [p[0], p[1]] as LngLat);
}

/** KML from Google Earth, onX Hunt, Garmin BaseCamp, county GIS exports. */
export function parseKml(xml: string): BoundaryShape[] {
  const out: BoundaryShape[] = [];
  let n = 0;
  for (const pm of tags(xml, "Placemark")) {
    const name = tag(pm, "name") ?? `Area ${++n}`;
    const polys = tags(pm, "Polygon");
    polys.forEach((poly, i) => {
      const outer = tag(tag(poly, "outerBoundaryIs") ?? "", "coordinates");
      if (!outer) return;
      const holes = tags(poly, "innerBoundaryIs").map((ib) => kmlCoords(decodeXml(tag(ib, "coordinates") ?? "")));
      const s = shape(polys.length > 1 ? `${name} (${i + 1})` : name, [kmlCoords(outer), ...holes]);
      if (s) out.push(s);
    });
    // A closed line (many apps save walked boundaries as lines) counts as an area.
    if (!polys.length)
      for (const line of [...tags(pm, "LineString"), ...tags(pm, "LinearRing")]) {
        const s = shape(name, [kmlCoords(decodeXml(tag(line, "coordinates") ?? ""))]);
        if (s) out.push(s);
      }
  }
  return out;
}

/** GPX tracks, routes and waypoint lists from Garmin units or BaseCamp. */
export function parseGpx(xml: string): BoundaryShape[] {
  const pts = (block: string, el: string): LngLat[] =>
    [...block.matchAll(new RegExp(`<${el}\\b([^>]*)>`, "gi"))].map((m) => {
      const lat = Number(m[1].match(/lat\s*=\s*["']([^"']+)["']/i)?.[1]);
      const lon = Number(m[1].match(/lon\s*=\s*["']([^"']+)["']/i)?.[1]);
      return [lon, lat] as LngLat;
    });
  const out: BoundaryShape[] = [];
  let n = 0;
  for (const trk of tags(xml, "trk")) {
    const name = tag(trk, "name") ?? `Track ${++n}`;
    const segs = tags(trk, "trkseg");
    segs.forEach((seg, i) => {
      const s = shape(segs.length > 1 ? `${name} (${i + 1})` : name, [pts(seg, "trkpt")]);
      if (s) out.push(s);
    });
  }
  for (const rte of tags(xml, "rte")) {
    const s = shape(tag(rte, "name") ?? `Route ${++n}`, [pts(rte, "rtept")]);
    if (s) out.push(s);
  }
  // Corner waypoints only (no tracks or routes): treat them, in order, as one outline.
  if (!out.length) {
    const s = shape("Waypoints", [pts(xml, "wpt")]);
    if (s) out.push(s);
  }
  return out;
}

type Json = Record<string, unknown>;

/** GeoJSON Feature / FeatureCollection / Polygon / MultiPolygon (closed LineStrings too). */
export function parseGeoJson(input: unknown): BoundaryShape[] {
  const out: BoundaryShape[] = [];
  let n = 0;
  const visit = (g: Json | null | undefined, name: string) => {
    if (!g || typeof g !== "object") return;
    const type = g.type as string;
    if (type === "FeatureCollection") (g.features as Json[]).forEach((f) => visit(f, name));
    else if (type === "Feature") {
      const props = (g.properties ?? {}) as Json;
      const nm = String(props.name ?? props.Name ?? props.NAME ?? props.title ?? props.label ?? `Area ${++n}`);
      visit(g.geometry as Json, nm);
    } else if (type === "GeometryCollection") (g.geometries as Json[]).forEach((x) => visit(x, name));
    else if (type === "Polygon") {
      const s = shape(name, g.coordinates as LngLat[][]);
      if (s) out.push(s);
    } else if (type === "MultiPolygon") {
      const polys = g.coordinates as LngLat[][][];
      polys.forEach((rings, i) => {
        const s = shape(polys.length > 1 ? `${name} (${i + 1})` : name, rings);
        if (s) out.push(s);
      });
    } else if (type === "LineString") {
      const s = shape(name, [g.coordinates as LngLat[]]);
      if (s) out.push(s);
    }
  };
  visit(input as Json, `Area ${++n}`);
  return out;
}

/**
 * A pasted list of corner points, one per line, in any format the property location accepts:
 *   31.9466, -85.645      31.9466 N 85.645 W      31°56'47.8"N 85°38'42.0"W
 * Blank lines separate multiple areas.
 */
export function parsePointList(text: string, name = "Pasted area"): { shapes: BoundaryShape[]; badLines: number[] } {
  const shapes: BoundaryShape[] = [];
  const badLines: number[] = [];
  let ring: LngLat[] = [];
  const flush = () => {
    const s = shape(shapes.length ? `${name} ${shapes.length + 1}` : name, [ring]);
    if (s) shapes.push(s);
    ring = [];
  };
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t) return flush();
    const p = parsePair(t.replace(/\t/g, ", "));
    if (p) ring.push([p.lng, p.lat]);
    else badLines.push(i + 1);
  });
  flush();
  if (shapes.length > 1) shapes[0] = { ...shapes[0], name: `${name} 1` };
  return { shapes, badLines };
}

/** Pick a parser from the file name / contents. */
export function parseBoundaryText(fileName: string, text: string): BoundaryShape[] {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const head = text.trimStart().slice(0, 200).toLowerCase();
  if (ext === "kml" || head.includes("<kml")) return parseKml(text);
  if (ext === "gpx" || head.includes("<gpx")) return parseGpx(text);
  if (ext === "geojson" || ext === "json" || head.startsWith("{")) return parseGeoJson(JSON.parse(text));
  return parsePointList(text, fileName.replace(/\.[^.]+$/, "")).shapes;
}
