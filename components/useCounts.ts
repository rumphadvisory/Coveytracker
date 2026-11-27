"use client";

import { useMemo } from "react";
import { fetchCounts, fetchMarks, pendingCounts, pendingMarks, withPending, type Pending } from "@/lib/data";
import type { CoveyCountRow, GpsMarkRow } from "@/types/database";
import { useProperty } from "./PropertyProvider";
import { useCachedQuery } from "./useCachedQuery";

/** Covey counts for a season: cached copy first, then server; plus counts saved offline. */
export function useCounts(season: string) {
  const { sb, property } = useProperty();
  const q = useCachedQuery(`counts:${property.id}:${season}`, () => fetchCounts(sb, property.id, season));
  const counts = useMemo<Pending<CoveyCountRow>[] | null>(
    () => (q.data ? withPending(q.data, pendingCounts(property.id, season)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, q.bump, property.id, season],
  );
  return { counts, error: q.error, offline: q.offline, reload: q.reload };
}

/** GPS marks for a season: cached copy first, then server; plus marks still on the phone. */
export function useMarks(season: string) {
  const { sb, property } = useProperty();
  const q = useCachedQuery(`marks:${property.id}:${season}`, () => fetchMarks(sb, property.id, season));
  const marks = useMemo<Pending<GpsMarkRow>[] | null>(
    () => (q.data ? withPending(q.data, pendingMarks(property.id, season)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, q.bump, property.id, season],
  );
  return { marks, error: q.error, offline: q.offline, reload: q.reload };
}
