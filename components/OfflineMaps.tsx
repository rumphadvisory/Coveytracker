"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { errorMessage } from "@/lib/data";
import {
  deleteOfflineMaps,
  loadRecord,
  offlineSupported,
  planUrls,
  saveOfflineMaps,
  type OfflineArea,
  type OfflineMapRecord,
  type Progress,
} from "@/lib/offlineMaps";
import { padBounds, shapesBounds } from "@/lib/geo";
import { AVG_TILE_BYTES, formatBytes, MAX_TILES, OFFLINE_STYLES, type OfflineStyle } from "@/lib/tiles";
import Icon from "./Icon";
import { useProperty } from "./PropertyProvider";

const RADII = [1, 2, 3, 5];

/** "Save maps for offline" panel: downloads USGS map tiles around the property onto the phone. */
export default function OfflineMaps() {
  const { property, canManage } = useProperty();
  const [record, setRecord] = useState<OfflineMapRecord | null>(null);
  const [supported, setSupported] = useState(true);
  const [radius, setRadius] = useState(2);
  const [styles, setStyles] = useState<OfflineStyle[]>(["topo", "aerial"]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const hasOutline = !!property.boundary?.length;
  useEffect(() => {
    setSupported(offlineSupported());
    const r = loadRecord(property.id);
    setRecord(r);
    if (r) {
      setRadius(r.radiusMiles);
      setStyles(r.styles);
    } else if (hasOutline) setRadius(0);
  }, [property.id, hasOutline]);

  useEffect(() => () => abort.current?.abort(), []);

  // With a property outline, the default area is the outline plus a quarter-mile margin.
  const outline = shapesBounds(property.boundary);
  const hasCenter = (property.lat != null && property.lng != null) || !!outline;
  const area: OfflineArea | null =
    radius === 0 && outline
      ? { bbox: padBounds(outline, 0.25) }
      : property.lat != null && property.lng != null
        ? { center: { lat: property.lat, lng: property.lng }, radiusMiles: radius || 2 }
        : outline
          ? { bbox: padBounds(outline, 0.25) }
          : null;
  const planned = area && styles.length ? planUrls(area, styles).length : 0;
  const tooBig = planned > MAX_TILES;

  async function save() {
    if (!area || !styles.length) return;
    setError(null);
    abort.current = new AbortController();
    setProgress({ done: 0, total: planned, failed: 0, bytes: 0 });
    try {
      // Make sure the map screen itself is saved too, so it opens with no signal.
      import("./MapView").catch(() => {});
      const r = await saveOfflineMaps(
        property.id,
        area,
        styles,
        setProgress,
        abort.current.signal,
      );
      setRecord(r);
      if (r.failed) setError(`${r.failed} map pieces didn't download. Tap Update maps on Wi-Fi to fill the gaps.`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(errorMessage(e));
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }

  async function remove() {
    if (!confirm("Delete the maps saved on this phone for this property?")) return;
    await deleteOfflineMaps(property.id);
    setRecord(null);
  }

  const toggle = (s: OfflineStyle) =>
    setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <section className="card mt-4 space-y-3">
      <h2 className="h-section flex items-center gap-2">
        <Icon name="download_for_offline" className="text-forest" /> Offline maps
      </h2>

      {!supported ? (
        <p className="text-sm text-bark">This browser can&apos;t save maps. Use Safari or Chrome on your phone.</p>
      ) : !hasCenter ? (
        <p className="text-sm text-bark">
          Set the property&apos;s location first.{" "}
          {canManage && (
            <Link href="/manage" className="font-semibold text-forest underline">
              Set it in Manage
            </Link>
          )}
        </p>
      ) : (
        <>
          {record && !progress && (
            <div className="flex items-start gap-2 rounded-xl bg-forest-light p-3 text-sm text-forest-dark">
              <Icon name="offline_pin" />
              <div className="flex-1">
                <strong>Saved on this phone</strong> ·{" "}
                {record.radiusMiles ? `${record.radiusMiles} mi around the property` : "property outline + ¼ mi"} ·{" "}
                {record.styles.map((s) => OFFLINE_STYLES[s].label).join(" + ")} · {formatBytes(record.bytes)}
                <div className="text-xs opacity-80">
                  {new Date(record.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
            </div>
          )}

          <div>
            <span className="label">Area to save</span>
            <div className="flex flex-wrap gap-2">
              {outline && (
                <button
                  type="button"
                  disabled={!!progress}
                  className={`chip ${radius === 0 ? "chip-on" : ""}`}
                  onClick={() => setRadius(0)}
                >
                  <Icon name="polyline" className="text-[18px]" /> Property outline
                </button>
              )}
              {RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={!!progress}
                  className={`chip ${radius === r ? "chip-on" : ""}`}
                  onClick={() => setRadius(r)}
                >
                  {r} mi
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label">Maps to save</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(OFFLINE_STYLES) as OfflineStyle[]).map((s) => (
                <label key={s} className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-forest"
                    checked={styles.includes(s)}
                    disabled={!!progress}
                    onChange={() => toggle(s)}
                  />
                  <span>
                    <strong>{OFFLINE_STYLES[s].label}</strong>
                    <span className="block text-xs text-bark">{OFFLINE_STYLES[s].description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {progress ? (
            <div>
              <div className="h-3 overflow-hidden rounded-full bg-sand-dark">
                <div
                  className="h-full rounded-full bg-forest transition-all"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-bark">
                <span>
                  Saving {progress.done} of {progress.total} map pieces · {formatBytes(progress.bytes)}
                </span>
                <button className="font-semibold text-red-700" onClick={() => abort.current?.abort()}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-bark">
                {styles.length
                  ? tooBig
                    ? "That area is too large to save. Pick a smaller radius."
                    : `About ${formatBytes(planned * AVG_TILE_BYTES)} (${planned} map pieces). Best done on Wi-Fi.`
                  : "Pick at least one map."}
              </p>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={!styles.length || tooBig} onClick={save}>
                  <Icon name="download" /> {record ? "Update maps" : "Save maps for offline"}
                </button>
                {record && (
                  <button className="btn-secondary" onClick={remove} aria-label="Delete saved maps">
                    <Icon name="delete" />
                  </button>
                )}
              </div>
            </>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}
          <p className="text-xs text-bark">
            With no signal, the map switches to these saved USGS maps automatically. Esri satellite views need signal.
          </p>
        </>
      )}
    </section>
  );
}
