import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Minimal browser stand-ins for lib/outbox.ts
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
Object.defineProperty(globalThis.localStorage, "keys", { value: () => [...store.keys()] });
const events: string[] = [];
(globalThis as Record<string, unknown>).window = { dispatchEvent: (e: Event) => (events.push(e.type), true) };

const o = await import("../lib/outbox.ts");
const P = "prop-1";
const mark = (id: string) => ({ id, property_id: P, type: "covey", lat: 31.1, lng: -84, season: "2026-2027", hunt_id: null });

beforeEach(() => {
  store.clear();
  events.length = 0;
});

test("enqueue keeps order and replaces a re-queued row in place", () => {
  o.enqueue(P, o.insertOp(P, "gps_marks", mark("a")), o.insertOp(P, "gps_marks", mark("b")));
  o.enqueue(P, o.insertOp(P, "gps_marks", { ...mark("a"), lat: 99 }));
  const q = o.loadOutbox(P);
  assert.deepEqual(q.map((x) => x.id), ["a", "b"]);
  assert.equal(q[0].kind === "insert" && q[0].row.lat, 99);
  assert.equal(o.removeQueuedRow(P, "b"), true);
  assert.equal(o.removeQueuedRow(P, "zzz"), false);
});

test("an offline hunt uploads before its dog runs and mark assignment", async () => {
  // Marks dropped in the field, then the hunt saved with no signal.
  o.enqueue(P, o.insertOp(P, "gps_marks", mark("m1")), o.insertOp(P, "gps_marks", mark("m2")));
  o.enqueue(
    P,
    o.insertOp(P, "hunts", { id: "h1", property_id: P, season: "2026-2027" }),
    o.insertOp(P, "dog_runs", { id: "r1", hunt_id: "h1", dog_id: "d1", contacts: 3 }),
    o.updateOp(P, "gps_marks", ["m1", "m2"], { hunt_id: "h1" }),
  );
  const sent: string[] = [];
  const r = await o.flushOutbox(P, async (op) => {
    sent.push(op.kind === "insert" ? `insert ${op.table} ${op.id}` : `update ${op.table} ${op.ids.join(",")}`);
    return { error: null };
  });
  assert.deepEqual(sent, [
    "insert gps_marks m1",
    "insert gps_marks m2",
    "insert hunts h1",
    "insert dog_runs r1",
    "update gps_marks m1,m2",
  ]);
  assert.deepEqual(r, { uploaded: 5, remaining: 0, offline: false });
  assert.ok(events.includes(o.SYNCED_EVENT));
});

test("flush treats duplicates as done and stops when offline", async () => {
  ["a", "b", "c", "d"].forEach((id) => o.enqueue(P, o.insertOp(P, "gps_marks", mark(id))));
  const sent: string[] = [];
  const r = await o.flushOutbox(P, async (op) => {
    sent.push(op.id);
    if (op.id === "b") return { error: { message: "duplicate key", code: "23505" } };
    if (op.id === "c") return { error: { message: "TypeError: Failed to fetch" } };
    return { error: null };
  });
  assert.deepEqual(sent, ["a", "b", "c"]);
  assert.deepEqual(r, { uploaded: 2, remaining: 2, offline: true });
});

test("server rejections stay queued with their error", async () => {
  o.enqueue(P, o.insertOp(P, "covey_counts", { id: "x", property_id: P, season: "2026-2027" }));
  const r = await o.flushOutbox(P, async () => ({ error: { message: "row-level security", code: "42501" } }));
  assert.equal(r.offline, false);
  assert.equal(o.loadOutbox(P)[0].lastError, "row-level security");
});

test("concurrent flushes share one upload", async () => {
  o.enqueue(P, o.insertOp(P, "gps_marks", mark("a")));
  let calls = 0;
  const exec = async () => {
    calls++;
    await new Promise((res) => setTimeout(res, 10));
    return { error: null };
  };
  await Promise.all([o.flushOutbox(P, exec), o.flushOutbox(P, exec), o.flushOutbox(P, exec)]);
  assert.equal(calls, 1);
});

test("deleting a queued hunt drops its dog runs and mark assignment, not the marks", () => {
  o.enqueue(
    P,
    o.insertOp(P, "gps_marks", mark("m1")),
    o.insertOp(P, "hunts", { id: "h1" }),
    o.insertOp(P, "dog_runs", { id: "r1", hunt_id: "h1" }),
    o.updateOp(P, "gps_marks", ["m1"], { hunt_id: "h1" }),
  );
  assert.equal(o.removeQueuedHunt(P, "h1"), true);
  assert.deepEqual(o.loadOutbox(P).map((x) => x.id), ["m1"]);
});

test("marks left in the old marks-only queue are migrated", () => {
  store.set(`ct:queue:${P}`, JSON.stringify([mark("old1"), { ...mark("old2"), lastError: "boom" }]));
  const q = o.loadOutbox(P);
  assert.deepEqual(q.map((x) => [x.kind, x.table, x.id]), [
    ["insert", "gps_marks", "old1"],
    ["insert", "gps_marks", "old2"],
  ]);
  assert.equal(q[1].lastError, "boom");
  assert.equal(store.has(`ct:queue:${P}`), false);
  assert.deepEqual(o.queuedRows(P, "gps_marks").map((r) => r.id), ["old1", "old2"]);
});

test("network error detection", () => {
  assert.equal(o.isNetworkError({ message: "TypeError: Failed to fetch" }), true);
  assert.equal(o.isNetworkError({ message: "Load failed" }), true);
  assert.equal(o.isNetworkError({ message: "fetch failed", code: "42501" }), false);
  assert.equal(o.isNetworkError(null), false);
});
