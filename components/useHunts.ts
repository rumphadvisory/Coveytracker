"use client";

import { useEffect, useState } from "react";
import { errorMessage, fetchHunts } from "@/lib/data";
import type { HuntWithRuns } from "@/types/database";
import { useProperty } from "./PropertyProvider";

export function useHunts(season: string) {
  const { sb, property } = useProperty();
  const [hunts, setHunts] = useState<HuntWithRuns[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setHunts(null);
    fetchHunts(sb, property.id, season)
      .then((h) => live && setHunts(h))
      .catch((e) => {
        if (!live) return;
        setError(errorMessage(e));
        setHunts([]);
      });
    return () => {
      live = false;
    };
  }, [sb, property.id, season]);
  return { hunts, error };
}
