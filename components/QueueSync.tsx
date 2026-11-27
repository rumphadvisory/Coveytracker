"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushQueue, loadQueue, QUEUE_EVENT, type QueuedMark } from "@/lib/markQueue";
import { useProperty } from "./PropertyProvider";

const RETRY_MS = 20_000;

/** Pending-upload state for the current property, kept in sync with the local queue. */
export function useMarkQueue() {
  const { sb, property } = useProperty();
  const [queue, setQueue] = useState<QueuedMark[]>([]);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);

  const refresh = useCallback(() => setQueue(loadQueue(property.id)), [property.id]);

  const flush = useCallback(async () => {
    if (flushing.current || loadQueue(property.id).length === 0) return;
    flushing.current = true;
    try {
      const r = await flushQueue(property.id, (row) => sb.from("gps_marks").insert(row));
      setOnline(!r.offline);
    } finally {
      flushing.current = false;
      refresh();
    }
  }, [sb, property.id, refresh]);

  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    const onQueue = () => refresh();
    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === "visible" && flush();
    window.addEventListener(QUEUE_EVENT, onQueue);
    window.addEventListener("storage", onQueue); // other tabs
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(QUEUE_EVENT, onQueue);
      window.removeEventListener("storage", onQueue);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, flush]);

  return { queue, pending: queue.length, online, flush };
}

/** Mounted once in the app layout: retries uploads in the background and shows a status strip. */
export default function QueueSync() {
  const { queue, pending, online, flush } = useMarkQueue();

  useEffect(() => {
    flush();
    if (pending === 0) return;
    const t = setInterval(flush, RETRY_MS);
    return () => clearInterval(t);
  }, [flush, pending]);

  if (pending === 0 && online) return null;
  const rejected = queue.filter((m) => m.lastError).length;

  return (
    <div
      role="status"
      className={`sticky top-[65px] z-[900] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold md:top-[105px] ${
        rejected ? "bg-red-700 text-white" : online ? "bg-amber-100 text-amber-900" : "bg-ink text-white"
      }`}
    >
      <span className="material-symbols-outlined text-[16px]">{online ? "cloud_upload" : "cloud_off"}</span>
      {!online && "No signal — "}
      {pending > 0
        ? `${pending} mark${pending === 1 ? "" : "s"} saved on this phone, waiting to upload`
        : "marks will be saved on this phone"}
      {rejected > 0 && ` (${rejected} rejected by server: ${queue.find((m) => m.lastError)?.lastError})`}
      {online && pending > 0 && (
        <button className="underline" onClick={flush}>
          Retry
        </button>
      )}
    </div>
  );
}
