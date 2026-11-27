// Query helpers. All reads are scoped to a property and filtered further by RLS.
import type { Supabase } from "@/lib/supabase/client";
import type { CoveyCountRow, GpsMarkRow, HuntWithRuns } from "@/types/database";

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
  const set = new Set<string>();
  for (const r of h.data ?? []) set.add(r.season);
  for (const r of c.data ?? []) set.add(r.season);
  return [...set];
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
