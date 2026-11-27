"use client";

import { useMemo } from "react";
import { fetchHunts, pendingHunts, withPending, type Pending } from "@/lib/data";
import type { HuntWithRuns } from "@/types/database";
import { useProperty } from "./PropertyProvider";
import { useCachedQuery } from "./useCachedQuery";

/** Hunts for a season: cached copy first, then server; plus hunts saved offline and not uploaded yet. */
export function useHunts(season: string) {
  const { sb, property } = useProperty();
  const q = useCachedQuery(`hunts:${property.id}:${season}`, () => fetchHunts(sb, property.id, season));
  const hunts = useMemo<Pending<HuntWithRuns>[] | null>(
    () => (q.data ? withPending(q.data, pendingHunts(property.id, season)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, q.bump, property.id, season],
  );
  return { hunts, error: q.error, offline: q.offline, reload: q.reload };
}
