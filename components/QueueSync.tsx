"use client";

import { useCallback, useEffect, useState } from "react";
import { flushOutbox, loadOutbox, QUEUE_EVENT, type Op } from "@/lib/outbox";
import type { Supabase } from "@/lib/supabase/client";
import { useProperty } from "./PropertyProvider";

const RETRY_MS = 20_000;

/** Send one queued op to Supabase. */
function exec(sb: Supabase, op: Op) {
  // Table names are checked by the OutboxTable type; rows were built from the same schema.
  const t = sb.from(op.table as "gps_marks");
  return op.kind === "insert" ? t.insert(op.row as never) : t.update(op.values as never).in("id", op.ids);
}

const LABELS: Record<Op["table"], [string, string]> = {
  gps_marks: ["mark", "marks"],
  hunts: ["hunt", "hunts"],
  dog_runs: ["dog run", "dog runs"],
  covey_counts: ["covey count", "covey counts"],
};

/** "3 marks, 1 hunt" — counts new rows only (updates ride along with them). */
export function describeQueue(ops: Op[]): string {
  const n = new Map<Op["table"], number>();
  for (const o of ops) if (o.kind === "insert" && o.table !== "dog_runs") n.set(o.table, (n.get(o.table) ?? 0) + 1);
  const parts = [...n].map(([t, c]) => `${c} ${LABELS[t][c === 1 ? 0 : 1]}`);
  return parts.length ? parts.join(", ") : `${ops.length} update${ops.length === 1 ? "" : "s"}`;
}

/** Pending-upload state for the current property, kept in sync with the local queue. */
export function useOutbox() {
  const { sb, property } = useProperty();
  const [ops, setOps] = useState<Op[]>([]);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(() => setOps(loadOutbox(property.id)), [property.id]);

  const flush = useCallback(async () => {
    if (loadOutbox(property.id).length === 0) return;
    const r = await flushOutbox(property.id, (op) => exec(sb, op));
    setOnline(!r.offline);
    refresh();
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

  return { ops, pending: ops.length, online, flush };
}

/** Mounted once in the app layout: retries uploads in the background and shows a status strip. */
export default function QueueSync() {
  const { ops, pending, online, flush } = useOutbox();

  useEffect(() => {
    flush();
    if (pending === 0) return;
    const t = setInterval(flush, RETRY_MS);
    return () => clearInterval(t);
  }, [flush, pending]);

  if (pending === 0 && online) return null;
  const rejected = ops.filter((o) => o.lastError);

  return (
    <div
      role="status"
      className={`sticky top-[65px] z-[900] flex print:hidden flex-wrap items-center justify-center gap-x-2 px-4 py-1.5 text-center text-xs font-semibold md:top-[105px] ${
        rejected.length ? "bg-red-700 text-white" : online ? "bg-amber-100 text-amber-900" : "bg-ink text-white"
      }`}
    >
      <span className="material-symbols-outlined text-[16px]">{online ? "cloud_upload" : "cloud_off"}</span>
      {!online && "No signal — "}
      {pending > 0 ? `${describeQueue(ops)} saved on this phone, waiting to upload` : "new entries will be saved on this phone"}
      {rejected.length > 0 && ` (${rejected.length} rejected by server: ${rejected[0].lastError})`}
      {online && pending > 0 && (
        <button className="underline" onClick={flush}>
          Retry
        </button>
      )}
    </div>
  );
}
