"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cacheGet, cacheSet } from "@/lib/cache";
import { errorMessage } from "@/lib/data";
import { isNetworkError, QUEUE_EVENT, SYNCED_EVENT } from "@/lib/outbox";

/**
 * Show the last-known copy of a query right away, then refresh from the server.
 * With no signal the cached copy stays on screen and `offline` is true.
 * Refetches after queued items upload, and `bump` re-runs on queue changes so screens can
 * merge in items still waiting to upload.
 */
export function useCachedQuery<T>(key: string | null, fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [bump, setBump] = useState(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async (k: string, showCached: boolean) => {
    if (showCached) {
      const cached = await cacheGet<T>(k);
      if (keyRef.current === k && cached !== undefined) setData(cached);
    }
    try {
      const fresh = await fetchRef.current();
      if (keyRef.current !== k) return;
      setData(fresh);
      setError(null);
      setOffline(false);
      cacheSet(k, fresh);
    } catch (e) {
      if (keyRef.current !== k) return;
      const err = e as { message: string; code?: string };
      if (isNetworkError(err)) {
        setOffline(true);
        // Nothing cached and no signal: show an empty result rather than spinning forever.
        setData((d) => d ?? ([] as unknown as T));
      } else {
        setError(errorMessage(e));
        setData((d) => d ?? ([] as unknown as T));
      }
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    setData(null);
    setError(null);
    load(key, true);
  }, [key, load]);

  useEffect(() => {
    const onSynced = () => keyRef.current && load(keyRef.current, false);
    const onQueue = () => setBump((b) => b + 1);
    window.addEventListener(SYNCED_EVENT, onSynced);
    window.addEventListener(QUEUE_EVENT, onQueue);
    return () => {
      window.removeEventListener(SYNCED_EVENT, onSynced);
      window.removeEventListener(QUEUE_EVENT, onQueue);
    };
  }, [load]);

  const reload = useCallback(() => keyRef.current && load(keyRef.current, false), [load]);
  return { data, error, offline, reload, bump };
}
