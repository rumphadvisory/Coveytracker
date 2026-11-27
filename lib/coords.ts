// Reading latitude/longitude the way people actually type or paste them:
//   31.9466   -85.645   85.645 W   W 85.645   85°38'42" W   85 38 42 W   31°56.8' N
// and whole pairs copied from Google or Apple Maps:
//   "31.9466, -85.645"   "31.9466° N, 85.6450° W"   "31°56'47.8"N 85°38'42.0"W"

export type Axis = "lat" | "lng";

const MAX: Record<Axis, number> = { lat: 90, lng: 180 };

/** Parse one coordinate. Returns signed decimal degrees, or null if it can't be read. */
export function parseCoordinate(input: string, axis: Axis): number | null {
  let s = input.trim().toUpperCase().replace(/[′’]/g, "'").replace(/[″”]/g, '"').replace(/º/g, "°");
  if (!s) return null;

  let sign = 1;
  const hemis = s.match(/[NSEW]/g);
  if (hemis) {
    if (hemis.length > 1) return null;
    const h = hemis[0];
    if (axis === "lat" ? h === "E" || h === "W" : h === "N" || h === "S") return null;
    if (h === "S" || h === "W") sign = -1;
    s = s.replace(/[NSEW]/, " ");
  }
  const minus = s.trim().startsWith("-");
  if (minus) {
    if (hemis) {
      // "-85.6 W" is redundant but clear; "-85.6 E" contradicts itself.
      if (sign === 1) return null;
    } else sign = -1;
    s = s.replace("-", " ");
  }
  if (/[^0-9.\s°'"]/.test(s)) return null; // anything else means we're guessing

  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length > 3) return null;
  const [d, m = 0, sec = 0] = nums.map(Number);
  if (nums.length > 1 && (m >= 60 || sec >= 60 || !Number.isInteger(d))) return null;
  if (nums.length > 2 && !Number.isInteger(m)) return null;

  const value = d + m / 60 + sec / 3600;
  if (!Number.isFinite(value) || value > MAX[axis]) return null;
  return Math.round(sign * value * 1e6) / 1e6;
}

/** Parse a "latitude, longitude" pair pasted from a maps app. */
export function parsePair(input: string): { lat: number; lng: number } | null {
  const s = input.trim();
  const tryParts = (a: string, b: string) => {
    const lat = parseCoordinate(a, "lat");
    const lng = parseCoordinate(b, "lng");
    return lat != null && lng != null ? { lat, lng } : null;
  };
  // "lat, lng" (the usual copy format)
  const comma = s.indexOf(",");
  if (comma > 0) {
    const r = tryParts(s.slice(0, comma), s.slice(comma + 1));
    if (r) return r;
  }
  // 31°56'47.8"N 85°38'42.0"W  — split after the N/S letter
  const hemi = s.match(/^(.*?[NSns])\s*(.+[EWew].*)$/);
  if (hemi) {
    const r = tryParts(hemi[1], hemi[2]);
    if (r) return r;
  }
  // "31.9466 -85.645"
  const two = s.match(/^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/);
  if (two) return tryParts(two[1], two[2]);
  return null;
}

export function formatCoordinate(value: number, axis: Axis): string {
  const h = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(5)}° ${h}`;
}

/**
 * A US-looking latitude with an eastern longitude is almost always a missing minus sign
 * (85.6 instead of -85.6 / 85.6 W). Returns the likely-intended longitude, or null.
 */
export function suspectMissingWest(lat: number, lng: number): number | null {
  return lat >= 17 && lat <= 72 && lng >= 60 && lng <= 180 ? -lng : null;
}
