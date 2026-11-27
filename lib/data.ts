// Query helpers. All reads are scoped to a property and filtered further by RLS.
import type { Supabase } from "@/lib/supabase/client";
import { queuedRows } from "@/lib/outbox";
import type { CoveyCountRow, DogRunRow, GpsMarkRow, HuntRow, HuntWithRuns } from "@/types/database";

export const ALL = "all";

export async function fetchHunts(sb: Supabase, propertyId: string, season?: string): Promise<HuntWithRuns[]> {
  let q = sb
    .from("hunts")
    .select("*, dog_runs(*)")
    .eq("property_id", propertyId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (season && season !== ALL) q = q.eq("season", season);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as HuntWithRuns[];
}

export async function fetchMarks(sb: Supabase, propertyId: string, season?: string): Promise<GpsMarkRow[]> {
  let q = sb.from("gps_marks").select("*").eq("property_id", propertyId).order("timestamp", { ascending: true });
  if (season && season !== ALL) q = q.eq("season", season);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchCounts(sb: Supabase, propertyId: string, season?: string): Promise<CoveyCountRow[]> {
  let q = sb
    .from("covey_counts")
    .select("*")
    .eq("property_id", propertyId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (season && season !== ALL) q = q.eq("season", season);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Distinct seasons that have hunts or counts. */
export async function fetchSeasons(sb: Supabase, propertyId: string): Promise<string[]> {
  const [h, c] = await Promise.all([
    sb.from("hunts").select("season").eq("property_id", propertyId),
    sb.from("covey_counts").select("season").eq("property_id", propertyId),
  ]);
  if (h.error) throw h.error;
  if (c.error) throw c.error;
  const set = new Set<string>();
  for (const r of h.data ?? []) set.add(r.season);
  for (const r of c.data ?? []) set.add(r.season);
  return [...set];
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

// ---------------------------------------------------------------------------
// Items saved on this phone but not uploaded yet, shaped like server rows so screens can
// list them (marked _pending). Database-calculated columns are filled in the same way the
// database calculates them.
// ---------------------------------------------------------------------------

export type Pending<T> = T & { _pending?: boolean };

function inSeason(row: { season?: unknown }, season?: string) {
  return !season || season === ALL || row.season === season;
}

export function pendingHunts(propertyId: string, season?: string): Pending<HuntWithRuns>[] {
  const runs = queuedRows<DogRunRow>(propertyId, "dog_runs");
  return queuedRows<HuntRow>(propertyId, "hunts")
    .filter((h) => inSeason(h, season))
    .map((h) => {
      const dog_runs = runs.filter((r) => r.hunt_id === h.id);
      return {
        ...h,
        total_coveys_seen: (h.coveys_pointed ?? 0) + (h.coveys_flushed_wild ?? 0),
        total_birds_adult: (h.total_birds_cocks ?? 0) + (h.total_birds_hens ?? 0),
        total_contacts: dog_runs.reduce((a, r) => a + (r.contacts ?? 0), 0),
        created_at: h.created_at ?? new Date().toISOString(),
        dog_runs,
        _pending: true,
      };
    });
}

export function pendingCounts(propertyId: string, season?: string): Pending<CoveyCountRow>[] {
  return queuedRows<CoveyCountRow>(propertyId, "covey_counts")
    .filter((c) => inSeason(c, season))
    .map((c) => ({
      ...c,
      estimated_birds: (c.coveys_heard ?? 0) * (c.avg_covey_size ?? 12),
      created_at: c.created_at ?? new Date().toISOString(),
      _pending: true,
    }));
}

export function pendingMarks(propertyId: string, season?: string): Pending<GpsMarkRow>[] {
  return queuedRows<GpsMarkRow>(propertyId, "gps_marks")
    .filter((m) => inSeason(m, season))
    .map((m) => ({ ...m, _pending: true }));
}

/** Server rows plus queued ones, without duplicates (a row can be in both mid-upload). */
export function withPending<T extends { id: string }>(server: T[], pending: Pending<T>[]): Pending<T>[] {
  const ids = new Set(server.map((r) => r.id));
  return [...pending.filter((p) => !ids.has(p.id)), ...server];
}
