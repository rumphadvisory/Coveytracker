// Saving map tiles onto the phone (Cache Storage) so the map works with no signal.
// The service worker serves saved tiles first; see public/sw.js.
import { AVG_TILE_BYTES, bboxAround, MAX_TILES, offlineUrls, TILE_CACHE, type OfflineStyle } from "./tiles";

export interface OfflineMapRecord {
  center: { lat: number; lng: number };
  radiusMiles: number;
  styles: OfflineStyle[];
  tiles: number;
  failed: number;
  bytes: number;
  savedAt: string;
}

const key = (propertyId: string) => `ct:offlinemaps:${propertyId}`;

export function loadRecord(propertyId: string): OfflineMapRecord | null {
  try {
    const raw = localStorage.getItem(key(propertyId));
    return raw ? (JSON.parse(raw) as OfflineMapRecord) : null;
  } catch {
    return null;
  }
}

function saveRecord(propertyId: string, r: OfflineMapRecord | null) {
  try {
    if (r) localStorage.setItem(key(propertyId), JSON.stringify(r));
    else localStorage.removeItem(key(propertyId));
  } catch {}
}

export function offlineSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator;
}

export function planUrls(lat: number, lng: number, radiusMiles: number, styles: OfflineStyle[]): string[] {
  return offlineUrls(bboxAround(lat, lng, radiusMiles), styles);
}

/** Fetch one tile, preferring a CORS response (counts its true size toward storage). */
async function fetchTile(url: string, signal: AbortSignal): Promise<Response | null> {
  try {
    const r = await fetch(url, { mode: "cors", signal });
    if (r.ok) return r;
  } catch (e) {
    if (signal.aborted) throw e;
  }
  try {
    const r = await fetch(url, { mode: "no-cors", signal });
    return r.type === "opaque" || r.ok ? r : null;
  } catch (e) {
    if (signal.aborted) throw e;
    return null;
  }
}

export interface Progress {
  done: number;
  total: number;
  failed: number;
  bytes: number;
}

/** Download every tile for the area, skipping ones already saved. Resumable: re-run to fill gaps. */
export async function saveOfflineMaps(
  propertyId: string,
  center: { lat: number; lng: number },
  radiusMiles: number,
  styles: OfflineStyle[],
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<OfflineMapRecord> {
  const urls = planUrls(center.lat, center.lng, radiusMiles, styles);
  if (urls.length > MAX_TILES) throw new Error("That area is too large to save. Pick a smaller radius.");
  // Ask the browser not to clear saved data when space runs low.
  await navigator.storage?.persist?.().catch(() => false);

  const cache = await caches.open(TILE_CACHE);
  const p: Progress = { done: 0, total: urls.length, failed: 0, bytes: 0 };
  let next = 0;

  async function worker() {
    while (next < urls.length) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const url = urls[next++];
      if (await cache.match(url)) {
        p.bytes += AVG_TILE_BYTES;
      } else {
        const res = await fetchTile(url, signal);
        if (res) {
          const size = res.type === "opaque" ? AVG_TILE_BYTES : Number(res.headers.get("content-length")) || AVG_TILE_BYTES;
          await cache.put(url, res);
          p.bytes += size;
        } else {
          p.failed++;
        }
      }
      p.done++;
      onProgress({ ...p });
    }
  }

  await Promise.all(Array.from({ length: 6 }, worker));
  const record: OfflineMapRecord = {
    center,
    radiusMiles,
    styles,
    tiles: p.total - p.failed,
    failed: p.failed,
    bytes: p.bytes,
    savedAt: new Date().toISOString(),
  };
  saveRecord(propertyId, record);
  return record;
}

/** Remove this property's saved tiles. Tiles shared with another saved property go too. */
export async function deleteOfflineMaps(propertyId: string): Promise<void> {
  const r = loadRecord(propertyId);
  if (r && offlineSupported()) {
    const cache = await caches.open(TILE_CACHE);
    await Promise.all(planUrls(r.center.lat, r.center.lng, r.radiusMiles, r.styles).map((u) => cache.delete(u)));
  }
  saveRecord(propertyId, null);
}
