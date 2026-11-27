import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Minimal browser stand-ins for lib/markQueue.ts
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as Record<string, unknown>).window = { dispatchEvent: () => true };

const { enqueueMark, loadQueue, dequeueMark, assignQueuedToHunt, flushQueue, isNetworkError } = await import(
  "../lib/markQueue.ts"
);

const P = "prop-1";
const mark = (id: string) => ({
  id, property_id: P, type: "covey" as const, lat: 31.1, lng: -84, accuracy: 5,
  dog_id: null, course_id: "c1", season: "2026-2027", timestamp: "2026-11-27T15:00:00Z", hunt_id: null,
});

beforeEach(() => store.clear());

test("enqueue / dequeue / assign hunt", () => {
  enqueueMark(mark("a"));
  enqueueMark(mark("b"));
  enqueueMark(mark("a")); // re-enqueue replaces, no duplicate
  assert.deepEqual(loadQueue(P).map((m) => m.id), ["b", "a"]);
  assert.equal(dequeueMark(P, "b"), true);
  assert.equal(dequeueMark(P, "zzz"), false);
  const hit = assignQueuedToHunt(P, ["a", "not-queued"], "hunt-9");
  assert.deepEqual([...hit], ["a"]);
  assert.equal(loadQueue(P)[0].hunt_id, "hunt-9");
});

test("flush uploads, treats duplicates as done, stops when offline", async () => {
  ["a", "b", "c", "d"].forEach((id) => enqueueMark(mark(id)));
  const sent: string[] = [];
  const r = await flushQueue(P, async (row) => {
    sent.push(row.id);
    assert.equal("lastError" in row, false);
    if (row.id === "b") return { error: { message: "duplicate key", code: "23505" } };
    if (row.id === "c") return { error: { message: "TypeError: Failed to fetch" } };
    return { error: null };
  });
  assert.deepEqual(sent, ["a", "b", "c"]); // stopped at the network failure
  assert.deepEqual(r, { uploaded: 2, remaining: 2, offline: true });
  assert.deepEqual(loadQueue(P).map((m) => m.id), ["c", "d"]);
});

test("server rejections stay queued with their error", async () => {
  enqueueMark(mark("x"));
  const r = await flushQueue(P, async () => ({ error: { message: "new row violates row-level security policy", code: "42501" } }));
  assert.equal(r.offline, false);
  assert.equal(loadQueue(P)[0].lastError, "new row violates row-level security policy");
});

test("network error detection", () => {
  assert.equal(isNetworkError({ message: "TypeError: Failed to fetch" }), true);
  assert.equal(isNetworkError({ message: "Load failed" }), true);
  assert.equal(isNetworkError({ message: "fetch failed", code: "42501" }), false);
  assert.equal(isNetworkError(null), false);
});

test("concurrent flushes share one upload", async () => {
  enqueueMark(mark("a"));
  let calls = 0;
  const insert = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return { error: null };
  };
  await Promise.all([flushQueue(P, insert), flushQueue(P, insert), flushQueue(P, insert)]);
  assert.equal(calls, 1);
});
