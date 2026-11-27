// Offline-first GPS marks. Every tap is written to a local queue first (with a
// client-generated id) and uploaded when there's signal. Uploads are idempotent:
// a duplicate-key error means an earlier attempt already landed.

export interface QueuedMark {
  id: string;
  property_id: string;
  type: "covey" | "contact";
  lat: number;
  lng: number;
  accuracy: number | null;
  dog_id: string | null;
  course_id: string | null;
  season: string;
  timestamp: string;
  hunt_id: string | null;
  lastError?: string;
}

export const QUEUE_EVENT = "ct:queue";
const key = (propertyId: string) => `ct:queue:${propertyId}`;

export function loadQueue(propertyId: string): QueuedMark[] {
  try {
    const raw = localStorage.getItem(key(propertyId));
    return raw ? (JSON.parse(raw) as QueuedMark[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(propertyId: string, q: QueuedMark[]) {
  try {
    if (q.length) localStorage.setItem(key(propertyId), JSON.stringify(q));
    else localStorage.removeItem(key(propertyId));
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { propertyId } }));
}

export function enqueueMark(m: QueuedMark) {
  saveQueue(m.property_id, [...loadQueue(m.property_id).filter((x) => x.id !== m.id), m]);
}

export function dequeueMark(propertyId: string, id: string): boolean {
  const q = loadQueue(propertyId);
  const next = q.filter((x) => x.id !== id);
  if (next.length === q.length) return false;
  saveQueue(propertyId, next);
  return true;
}

/** Attach still-queued marks to a hunt so they upload with hunt_id set. Returns ids that were queued. */
export function assignQueuedToHunt(propertyId: string, ids: string[], huntId: string): Set<string> {
  const want = new Set(ids);
  const hit = new Set<string>();
  const q = loadQueue(propertyId).map((m) => {
    if (!want.has(m.id)) return m;
    hit.add(m.id);
    return { ...m, hunt_id: huntId };
  });
  if (hit.size) saveQueue(propertyId, q);
  return hit;
}

export interface InsertResult {
  error: { message: string; code?: string } | null;
}

/** True when the failure is "no signal" rather than the server rejecting the row. */
export function isNetworkError(err: { message: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) return false; // Postgres error code → server answered
  return /fetch|network|load failed|timeout|offline/i.test(err.message);
}

/**
 * Upload queued marks in order. Stops at the first network failure (still offline).
 * Rows the server rejects keep their error message and stay queued so nothing is silently lost.
 */
type FlushResult = { uploaded: number; remaining: number; offline: boolean };
const inflight = new Map<string, Promise<FlushResult>>();

export function flushQueue(
  propertyId: string,
  insert: (m: Omit<QueuedMark, "lastError">) => PromiseLike<InsertResult>,
): Promise<FlushResult> {
  // One upload at a time per property, however many components ask.
  const running = inflight.get(propertyId);
  if (running) return running;
  const p = doFlush(propertyId, insert).finally(() => inflight.delete(propertyId));
  inflight.set(propertyId, p);
  return p;
}

async function doFlush(
  propertyId: string,
  insert: (m: Omit<QueuedMark, "lastError">) => PromiseLike<InsertResult>,
): Promise<FlushResult> {
  let uploaded = 0;
  let offline = false;
  for (const item of loadQueue(propertyId)) {
    const row = { ...item };
    delete row.lastError;
    let res: InsertResult;
    try {
      res = await insert(row);
    } catch (e) {
      res = { error: { message: e instanceof Error ? e.message : String(e) } };
    }
    if (!res.error || res.error.code === "23505") {
      dequeueMark(propertyId, item.id);
      uploaded++;
    } else if (isNetworkError(res.error)) {
      offline = true;
      break;
    } else {
      // Re-read: the queue may have changed while we awaited.
      saveQueue(
        propertyId,
        loadQueue(propertyId).map((m) => (m.id === item.id ? { ...m, lastError: res.error!.message } : m)),
      );
    }
  }
  return { uploaded, remaining: loadQueue(propertyId).length, offline };
}
