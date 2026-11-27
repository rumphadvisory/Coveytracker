// Last-known copies of server data (hunts, marks, counts…) in IndexedDB, so screens render
// instantly and still show something with no signal. Falls back to memory if IndexedDB is
// unavailable (private browsing). Cleared on sign out.

const DB = "coveytracker";
const STORE = "cache";
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let dbp: Promise<IDBDatabase | null> | null = null;
const db = () => (dbp ??= open());

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve) => {
        if (!d) return resolve(undefined);
        try {
          const req = fn(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const v = await run<T>("readonly", (s) => s.get(key));
  return v ?? (memory.get(key) as T | undefined);
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  await run("readwrite", (s) => s.put(value, key));
}

export async function cacheClear(): Promise<void> {
  memory.clear();
  await run("readwrite", (s) => s.clear());
}
