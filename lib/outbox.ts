// Offline-first writes. Everything collected in the field (GPS marks, hunts, dog runs,
// covey counts) is written to an ordered queue on the phone first, with ids generated on
// the phone, and uploaded when there's signal. Order matters: a hunt saved offline must
// upload before the dog runs and mark updates that point at it.
//
// Uploads are idempotent: an insert that hits a duplicate-key error already landed on an
// earlier attempt; updates can simply be repeated.

export type OutboxTable = "gps_marks" | "hunts" | "dog_runs" | "covey_counts";
type Row = { id: string } & Record<string, unknown>;

interface OpBase {
  /** For inserts this is the row id, so a queued row can be found and removed. */
  id: string;
  propertyId: string;
  table: OutboxTable;
  lastError?: string;
}
export interface InsertOp extends OpBase {
  kind: "insert";
  row: Row;
}
export interface UpdateOp extends OpBase {
  kind: "update";
  ids: string[];
  values: Record<string, unknown>;
}
export type Op = InsertOp | UpdateOp;

export const QUEUE_EVENT = "ct:queue";
/** Fired after a flush uploaded at least one item, so screens can refetch. */
export const SYNCED_EVENT = "ct:synced";

const key = (propertyId: string) => `ct:outbox:${propertyId}`;
const legacyKey = (propertyId: string) => `ct:queue:${propertyId}`; // marks-only queue (v1)

function emit(name: string, propertyId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail: { propertyId } }));
}

function read(k: string): unknown[] {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as unknown[]) : [];
  } catch {
    return [];
  }
}

export function loadOutbox(propertyId: string): Op[] {
  const ops = read(key(propertyId)) as Op[];
  // One-time migration of marks queued by the earlier marks-only queue.
  const legacy = read(legacyKey(propertyId)) as (Row & { lastError?: string })[];
  if (legacy.length) {
    const have = new Set(ops.map((o) => o.id));
    const migrated: Op[] = legacy
      .filter((m) => !have.has(m.id))
      .map(({ lastError, ...row }) => ({ kind: "insert", id: row.id, propertyId, table: "gps_marks", row, lastError }));
    const all = [...migrated, ...ops];
    save(propertyId, all, false);
    try {
      localStorage.removeItem(legacyKey(propertyId));
    } catch {}
    return all;
  }
  return ops;
}

function save(propertyId: string, ops: Op[], notify = true) {
  try {
    if (ops.length) localStorage.setItem(key(propertyId), JSON.stringify(ops));
    else localStorage.removeItem(key(propertyId));
  } catch {}
  if (notify) emit(QUEUE_EVENT, propertyId);
}

/** Append ops in order. An insert whose row id is already queued replaces it in place. */
export function enqueue(propertyId: string, ...newOps: Op[]) {
  const ops = loadOutbox(propertyId);
  for (const op of newOps) {
    const i = op.kind === "insert" ? ops.findIndex((o) => o.kind === "insert" && o.id === op.id) : -1;
    if (i >= 0) ops[i] = op;
    else ops.push(op);
  }
  save(propertyId, ops);
}

export const insertOp = (propertyId: string, table: OutboxTable, row: Row): InsertOp => ({
  kind: "insert",
  id: row.id,
  propertyId,
  table,
  row,
});

export const updateOp = (propertyId: string, table: OutboxTable, ids: string[], values: Record<string, unknown>): UpdateOp => ({
  kind: "update",
  id: `upd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  propertyId,
  table,
  ids,
  values,
});

/** Remove a queued (not yet uploaded) row. Returns false if it wasn't queued. */
export function removeQueuedRow(propertyId: string, rowId: string): boolean {
  const ops = loadOutbox(propertyId);
  const next = ops.filter((o) => !(o.kind === "insert" && o.id === rowId));
  if (next.length === ops.length) return false;
  save(propertyId, next);
  return true;
}

/** Remove a queued hunt together with its queued dog runs and mark assignments. */
export function removeQueuedHunt(propertyId: string, huntId: string): boolean {
  const ops = loadOutbox(propertyId);
  const next = ops.filter(
    (o) =>
      !(
        (o.kind === "insert" && o.table === "hunts" && o.id === huntId) ||
        (o.kind === "insert" && o.table === "dog_runs" && o.row.hunt_id === huntId) ||
        (o.kind === "update" && o.values.hunt_id === huntId)
      ),
  );
  if (next.length === ops.length) return false;
  save(propertyId, next);
  return true;
}

/** Rows of queued inserts for one table (for showing "waiting to upload" items). */
export function queuedRows<T = Row>(propertyId: string, table: OutboxTable): T[] {
  return loadOutbox(propertyId)
    .filter((o): o is InsertOp => o.kind === "insert" && o.table === table)
    .map((o) => o.row as unknown as T);
}

export function queuedIds(propertyId: string, table: OutboxTable): Set<string> {
  return new Set(queuedRows<Row>(propertyId, table).map((r) => r.id));
}

export interface ExecResult {
  error: { message: string; code?: string } | null;
}

/** True when the failure is "no signal" rather than the server rejecting the request. */
export function isNetworkError(err: { message: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) return false; // Postgres error code → server answered
  return /fetch|network|load failed|timeout|offline/i.test(err.message);
}

export type FlushResult = { uploaded: number; remaining: number; offline: boolean };
const inflight = new Map<string, Promise<FlushResult>>();

/**
 * Upload queued ops in order. Stops at the first network failure (still offline).
 * Ops the server rejects keep their error message and stay queued so nothing is lost silently.
 * One flush at a time per property, however many components ask.
 */
export function flushOutbox(propertyId: string, exec: (op: Op) => PromiseLike<ExecResult>): Promise<FlushResult> {
  const running = inflight.get(propertyId);
  if (running) return running;
  const p = doFlush(propertyId, exec).finally(() => inflight.delete(propertyId));
  inflight.set(propertyId, p);
  return p;
}

async function doFlush(propertyId: string, exec: (op: Op) => PromiseLike<ExecResult>): Promise<FlushResult> {
  let uploaded = 0;
  let offline = false;
  for (const op of loadOutbox(propertyId)) {
    let res: ExecResult;
    try {
      res = await exec(op);
    } catch (e) {
      res = { error: { message: e instanceof Error ? e.message : String(e) } };
    }
    const done = !res.error || (op.kind === "insert" && res.error.code === "23505");
    // Re-read each time: the queue may have changed while we awaited.
    if (done) {
      save(propertyId, loadOutbox(propertyId).filter((o) => o.id !== op.id));
      uploaded++;
    } else if (isNetworkError(res.error)) {
      offline = true;
      break;
    } else {
      save(
        propertyId,
        loadOutbox(propertyId).map((o) => (o.id === op.id ? { ...o, lastError: res.error!.message } : o)),
      );
    }
  }
  if (uploaded) emit(SYNCED_EVENT, propertyId);
  return { uploaded, remaining: loadOutbox(propertyId).length, offline };
}

/** Items waiting to upload across every property on this phone (used before signing out). */
export function totalQueued(): number {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith("ct:outbox:") || k.startsWith("ct:queue:"))
      .reduce((n, k) => n + read(k).length, 0);
  } catch {
    return 0;
  }
}
