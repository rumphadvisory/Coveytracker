// Map tiles that can be saved for offline use. Only public-domain USGS basemaps are saved:
// Esri's imagery terms don't allow offline caching, so Esri layers stay online-only.

export const TILE_CACHE = "ct-tiles-v1"; // keep in sync with public/sw.js

export const OFFLINE_STYLES = {
  topo: {
    label: "Topo",
    description: "Contours, roads, creeks and place names",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
  },
  aerial: {
    label: "Aerial",
    description: "USGS aerial photos with roads and labels",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}",
  },
} as const;
export type OfflineStyle = keyof typeof OFFLINE_STYLES;

/** USGS tiles stop at zoom 16; Leaflet scales them up beyond that. */
export const OFFLINE_MAX_ZOOM = 16;
export const OFFLINE_MIN_ZOOM = 11;
/** Rough average size of one saved tile, for estimates. */
export const AVG_TILE_BYTES = 25_000;
export const MAX_TILES = 4000;

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const MILE_M = 1609.344;
const EARTH_R = 6_378_137;

/** Square box of `radiusMiles` around a point. */
export function bboxAround(lat: number, lng: number, radiusMiles: number): BBox {
  const d = (radiusMiles * MILE_M) / EARTH_R; // angular distance (radians)
  const dLat = (d * 180) / Math.PI;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

/** Slippy-map tile x/y containing a point at zoom z. */
export function tileXY(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latR = (Math.max(Math.min(lat, 85.0511), -85.0511) * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return { x: Math.min(Math.max(x, 0), n - 1), y: Math.min(Math.max(y, 0), n - 1) };
}

export interface Tile {
  z: number;
  x: number;
  y: number;
}

export function tilesInBBox(b: BBox, minZoom = OFFLINE_MIN_ZOOM, maxZoom = OFFLINE_MAX_ZOOM): Tile[] {
  const out: Tile[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const nw = tileXY(b.north, b.west, z);
    const se = tileXY(b.south, b.east, z);
    for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) out.push({ z, x, y });
  }
  return out;
}

export function tileUrl(style: OfflineStyle, t: Tile): string {
  return OFFLINE_STYLES[style].url.replace("{z}", String(t.z)).replace("{y}", String(t.y)).replace("{x}", String(t.x));
}

export function offlineUrls(b: BBox, styles: OfflineStyle[]): string[] {
  const tiles = tilesInBBox(b);
  return styles.flatMap((s) => tiles.map((t) => tileUrl(s, t)));
}

export function formatBytes(n: number): string {
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} KB`;
  return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
}
