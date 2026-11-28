// Dog GPS tracks from Garmin collars (Astro 430 + T5, Alpha + TT15, …) exported as GPX.
// Pure functions so they can be unit tested; see app/(app)/hunts/[id] for the UI.
import type { DogRow, TrackPoint } from "../types/database";

export interface ParsedTrack {
  name: string;
  points: TrackPoint[]; // [lng, lat, unixSeconds]
}

export interface TrackStats {
  distanceM: number;
  durationS: number;
  movingS: number;
  startedAt: number | null;
  endedAt: number | null;
}

const EARTH_R = 6_371_008.8;
/** A dog doesn't cover ground faster than this; anything quicker is a GPS jump. */
const MAX_SPEED_MS = 18; // ~40 mph
/** Below this between fixes the dog is standing (on point, honoring, resting). */
const MOVING_MS = 0.6; // ~1.3 mph

export function haversine([lng1, lat1]: [number, number] | TrackPoint, [lng2, lat2]: [number, number] | TrackPoint): number {
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : null;
}

function tags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>[\\s\\S]*?</(?:\\w+:)?${name}>`, "gi"))].map((m) => m[0]);
}

function decode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Points of one <trkseg>/<trk>: lat/lon attributes plus <time>. */
function trkpts(block: string): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const m of block.matchAll(/<(?:\w+:)?trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?trkpt>)/gi)) {
    const attrs = m[1];
    const lat = Number(attrs.match(/lat\s*=\s*["']([^"']+)["']/i)?.[1]);
    const lon = Number(attrs.match(/lon\s*=\s*["']([^"']+)["']/i)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const time = m[2] ? tag(m[2], "time") : null;
    const t = time ? Date.parse(time) / 1000 : NaN;
    out.push([+lon.toFixed(7), +lat.toFixed(7), Number.isFinite(t) ? Math.round(t) : 0]);
  }
  return out;
}

/** Every track in a GPX file (one per dog in a Garmin Astro/Alpha export). */
export function parseGpxTracks(xml: string): ParsedTrack[] {
  const out: ParsedTrack[] = [];
  let n = 0;
  for (const trk of tags(xml, "trk")) {
    const name = decode(tag(trk, "name") ?? "") || `Track ${++n}`;
    const points = trkpts(trk).sort((a, b) => a[2] - b[2]);
    if (points.length >= 2) out.push({ name, points });
  }
  return out;
}

export function trackStats(points: TrackPoint[]): TrackStats {
  let distanceM = 0;
  let movingS = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    const dt = points[i][2] - points[i - 1][2];
    if (dt <= 0) continue;
    const speed = d / dt;
    if (speed > MAX_SPEED_MS) continue; // GPS jump
    distanceM += d;
    if (speed >= MOVING_MS && dt <= 120) movingS += dt;
  }
  const timed = points.filter((p) => p[2] > 0);
  const startedAt = timed.length ? timed[0][2] : null;
  const endedAt = timed.length ? timed[timed.length - 1][2] : null;
  return { distanceM, durationS: startedAt != null && endedAt != null ? endedAt - startedAt : 0, movingS, startedAt, endedAt };
}

/** Local calendar date (YYYY-MM-DD) of a unix time on this device. */
export function localDate(unixS: number): string {
  const d = new Date(unixS * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Keep the part of a track recorded on the hunt's date. A Garmin `Current.gpx` often holds
 * several days; if nothing matches (or there are no times) the whole track is kept.
 */
export function trimToDate(points: TrackPoint[], date: string): { points: TrackPoint[]; trimmed: boolean } {
  const onDay = points.filter((p) => p[2] > 0 && localDate(p[2]) === date);
  return onDay.length >= 2 ? { points: onDay, trimmed: onDay.length !== points.length } : { points, trimmed: false };
}

/** Drop points closer than `minSeconds` apart (always keeps the ends) and cap the count. */
export function thin(points: TrackPoint[], minSeconds = 4, maxPoints = 3000): TrackPoint[] {
  if (points.length <= 2) return points;
  let out: TrackPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) if (points[i][2] - out[out.length - 1][2] >= minSeconds) out.push(points[i]);
  out.push(points[points.length - 1]);
  if (out.length > maxPoints) {
    const step = out.length / maxPoints;
    out = Array.from({ length: maxPoints }, (_, i) => out[Math.min(out.length - 1, Math.round(i * step))]);
  }
  return out;
}

/** Match a track to a dog by name ("Belle", "BELLE", "Belle - T5", "Track Belle"). */
export function matchDog(trackName: string, dogs: DogRow[]): DogRow | undefined {
  const t = trackName.toLowerCase();
  const words = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
  return (
    dogs.find((d) => d.name.toLowerCase() === t.trim()) ??
    dogs.find((d) => words.has(d.name.toLowerCase())) ??
    dogs.find((d) => d.name.length >= 3 && t.includes(d.name.toLowerCase()))
  );
}

/** Where the dog was at a moment: the nearest fix within `windowS` seconds, if any. */
export function positionAt(points: TrackPoint[], unixS: number, windowS = 90): TrackPoint | null {
  let best: TrackPoint | null = null;
  let bestDt = Infinity;
  for (const p of points) {
    const dt = Math.abs(p[2] - unixS);
    if (dt < bestDt) {
      best = p;
      bestDt = dt;
    }
  }
  return best && bestDt <= windowS ? best : null;
}

export const metersToMiles = (m: number) => m / 1609.344;
export const metersToYards = (m: number) => m * 1.0936133;

export function formatDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
