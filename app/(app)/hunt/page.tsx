"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { MapArea, MapTrack } from "@/components/MapView";
import { useProperty } from "@/components/PropertyProvider";
import StatBox, { RatePill } from "@/components/StatBox";
import { useMarks } from "@/components/useCounts";
import { useCachedQuery } from "@/components/useCachedQuery";
import { useHunts } from "@/components/useHunts";
import { ErrorNote, Loading } from "@/components/ui";
import { courseColor, PROPERTY_COLOR } from "@/lib/areas";
import { ALL, errorMessage } from "@/lib/data";
import { formatDate } from "@/lib/seasons";
import { dogStats, fmtPct, fmtRate, rates, totals } from "@/lib/stats";
import {
  formatDuration,
  haversine,
  matchDog,
  metersToMiles,
  metersToYards,
  parseGpxTracks,
  positionAt,
  thin,
  trackStats,
  trimToDate,
} from "@/lib/tracks";
import type { DogTrackRow, TrackPoint } from "@/types/database";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-sand-dark" />,
});

/** Bright on satellite and topo; distinct from covey orange and contact blue. */
const TRACK_COLORS = ["#ffd400", "#ff4fd8", "#00e5ff", "#9dff00", "#ff8c1a", "#b58cff", "#ffffff"];
const MIGRATION_SQL_FILE = "supabase/migrations/20261129000000_dog_tracks.sql";

interface Pending {
  key: string;
  name: string;
  dogId: string; // "" = don't import
  points: TrackPoint[];
  trimmed: boolean;
}

/**
 * One hunt: map with the course, marks and Garmin dog tracks; summary; each dog's performance;
 * timeline. Lives at /hunt?id=… (one static page, so it opens offline like the rest of the app).
 */
export default function HuntDetailPage() {
  return (
    <Suspense fallback={<Loading />}>
      <HuntFromUrl />
    </Suspense>
  );
}

function HuntFromUrl() {
  const id = useSearchParams().get("id") ?? "";
  // Keyed by id so moving to the previous/next hunt starts fresh (no leftover upload state).
  return <HuntDetail key={id} id={id} />;
}

function HuntDetail({ id }: { id: string }) {
  const params = { id };
  const { sb, property, courses, dogs, courseName, dogName, canManage, user } = useProperty();
  const { hunts, error: huntsError } = useHunts(ALL);
  const hunt = hunts?.find((h) => h.id === params.id);
  const { marks: seasonMarks } = useMarks(hunt?.season ?? ALL);
  const tracksQ = useCachedQuery<DogTrackRow[]>(hunt && !hunt._pending ? `tracks:${hunt.id}` : null, async () => {
    const { data, error } = await sb.from("dog_tracks").select("*").eq("hunt_id", params.id).order("created_at");
    if (error) throw error;
    return data ?? [];
  });
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tracks = tracksQ.data ?? [];
  const tracksMissing = /dog_tracks/.test(tracksQ.error ?? "") && /does not exist|schema cache/i.test(tracksQ.error ?? "");
  const dogColor = (dogId: string | null) => TRACK_COLORS[Math.max(0, dogs.findIndex((d) => d.id === dogId)) % TRACK_COLORS.length];

  const marks = useMemo(
    () => (seasonMarks ?? []).filter((m) => m.hunt_id === params.id).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [seasonMarks, params.id],
  );

  const areas = useMemo<MapArea[]>(() => {
    if (!hunt) return [];
    const out: MapArea[] = [];
    if (property.boundary?.length)
      out.push({ id: "property", label: property.name, color: PROPERTY_COLOR, shapes: property.boundary, kind: "property" });
    const c = courses.find((x) => x.id === hunt.course_id);
    if (c?.boundary?.length) out.push({ id: c.id, label: c.name, color: courseColor(courses, c.id), shapes: c.boundary, kind: "course" });
    return out;
  }, [hunt, property, courses]);

  const mapTracks = useMemo<MapTrack[]>(
    () => [
      ...tracks.map((t) => ({
        id: t.id,
        label: dogName(t.dog_id) !== "—" ? dogName(t.dog_id) : t.name,
        color: dogColor(t.dog_id),
        points: t.points.map(([lng, lat]) => [lat, lng] as [number, number]),
      })),
      ...pending
        .filter((p) => p.dogId)
        .map((p) => ({ id: p.key, label: `${dogName(p.dogId)} (not saved)`, color: dogColor(p.dogId), points: p.points.map(([lng, lat]) => [lat, lng] as [number, number]) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tracks, pending, dogs],
  );

  if (!hunts) return <Loading />;
  if (!hunt)
    return (
      <div className="card text-center text-sm text-bark">
        <ErrorNote error={huntsError} />
        This hunt wasn&apos;t found. It may have been deleted.{" "}
        <Link href="/hunts" className="font-semibold text-forest underline">
          Back to hunts
        </Link>
      </div>
    );

  const t = totals([hunt]);
  const r = rates(t);
  const seasonHunts = hunts.filter((h) => h.season === hunt.season && !h._pending);
  const seasonDog = new Map(dogStats(dogs, seasonHunts).map((s) => [s.dog.id, s]));
  const sameCourse = hunts.filter((h) => h.course_id === hunt.course_id).sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const idx = sameCourse.findIndex((h) => h.id === hunt.id);
  const prev = sameCourse[idx - 1];
  const next = sameCourse[idx + 1];
  const canEditTracks = canManage || hunt.created_by === user.id;

  // Dogs on this hunt: everyone with a dog run, plus any dog that only has a track.
  const dogIds = [...new Set([...hunt.dog_runs.map((d) => d.dog_id), ...tracks.map((x) => x.dog_id).filter((x): x is string => !!x)])];

  /** Nearest tracked dog to a mark at the moment it was made. */
  function nearestDog(lat: number, lng: number, when: string) {
    const ts = Date.parse(when) / 1000;
    let best: { dogId: string | null; yards: number } | null = null;
    for (const tr of tracks) {
      const p = positionAt(tr.points, ts);
      if (!p) continue;
      const yards = metersToYards(haversine([lng, lat], p));
      if (!best || yards < best.yards) best = { dogId: tr.dog_id, yards };
    }
    return best;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const parsed = parseGpxTracks(await file.text());
      if (!parsed.length) return setError(`No tracks found in ${file.name}. Export the dog tracks from the Astro or BaseCamp as GPX.`);
      setPending(
        parsed.map((p, i) => {
          const { points, trimmed } = trimToDate(p.points, hunt!.date);
          return { key: `${Date.now()}-${i}`, name: p.name, dogId: matchDog(p.name, dogs)?.id ?? "", points: thin(points), trimmed };
        }),
      );
    } catch (err) {
      setError(`Couldn't read ${file.name}: ${errorMessage(err)}`);
    }
  }

  async function saveTracks() {
    const rows = pending.filter((p) => p.dogId);
    if (!rows.length) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.from("dog_tracks").insert(
      rows.map((p) => {
        const s = trackStats(p.points);
        return {
          property_id: property.id,
          hunt_id: hunt!.id,
          dog_id: p.dogId,
          name: p.name,
          points: p.points,
          distance_m: Math.round(s.distanceM),
          duration_s: s.durationS,
          moving_s: s.movingS,
          started_at: s.startedAt ? new Date(s.startedAt * 1000).toISOString() : null,
          ended_at: s.endedAt ? new Date(s.endedAt * 1000).toISOString() : null,
        };
      }),
    );
    setBusy(false);
    if (error) {
      setError(
        /dog_tracks/.test(error.message) && /does not exist|schema cache/i.test(error.message)
          ? `The database needs a one-time update for Garmin tracks. In Supabase → SQL Editor, run ${MIGRATION_SQL_FILE}.`
          : /fetch|network|load failed/i.test(error.message)
            ? "No signal right now. Add the tracks again when you're back in range."
            : error.message,
      );
      return;
    }
    setPending([]);
    setNotice(`Added ${rows.length} track${rows.length === 1 ? "" : "s"}.`);
    tracksQ.reload();
  }

  async function removeTrack(tr: DogTrackRow) {
    if (!confirm(`Remove ${dogName(tr.dog_id)}'s track from this hunt?`)) return;
    const { error } = await sb.from("dog_tracks").delete().eq("id", tr.id);
    if (error) return setError(error.message);
    tracksQ.reload();
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <Link href="/hunts" className="btn-ghost min-h-0 px-2 py-1">
          <Icon name="arrow_back" className="text-[18px]" /> Hunts
        </Link>
        <span className="ml-auto flex gap-1">
          {prev && (
            <Link href={`/hunt?id=${prev.id}`} className="btn-ghost min-h-0 px-2 py-1" aria-label="Previous hunt on this course">
              <Icon name="chevron_left" />
            </Link>
          )}
          {next && (
            <Link href={`/hunt?id=${next.id}`} className="btn-ghost min-h-0 px-2 py-1" aria-label="Next hunt on this course">
              <Icon name="chevron_right" />
            </Link>
          )}
        </span>
      </div>

      <h1 className="h-page">
        {formatDate(hunt.date)} · {courseName(hunt.course_id)}
      </h1>
      <p className="mb-3 text-sm text-bark">
        {[hunt.weather, hunt.temperature, hunt.wind, hunt.barometric_pressure, hunt.ground && `${hunt.ground} ground`]
          .filter(Boolean)
          .join(" · ") || "No conditions recorded"}
        {hunt.hours_spent != null && ` · ${hunt.hours_spent} h`}
      </p>
      {hunt._pending && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          <Icon name="cloud_off" /> Saved on this phone, waiting to upload. Garmin tracks can be added once it&apos;s uploaded.
        </div>
      )}
      <ErrorNote error={error} />
      {notice && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-forest-light p-3 text-sm text-forest-dark">
          <Icon name="check_circle" /> {notice}
        </div>
      )}

      <MapView
        className="h-[50vh] min-h-[300px]"
        marks={marks}
        courseName={courseName}
        dogName={dogName}
        areas={areas}
        tracks={mapTracks}
        home={property.lat != null && property.lng != null ? { lat: property.lat, lng: property.lng } : null}
        fitKey={`hunt:${hunt.id}:${marks.length > 0}:${mapTracks.length}`}
      />
      {mapTracks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mapTracks.map((tr) => (
            <span key={tr.id} className="pill">
              <span className="inline-block h-2.5 w-4 rounded-full border border-ink/30" style={{ background: tr.color }} /> {tr.label}
            </span>
          ))}
        </div>
      )}

      <section className="card mt-4">
        <h2 className="h-section mb-3">Hunt summary</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <StatBox label="Coveys seen" value={t.coveysSeen} accent="#e76624" />
          <StatBox label="Pointed" value={t.pointed} />
          <StatBox label="Shot" value={t.shot} />
          <StatBox label="Flushed wild" value={t.wild} />
          <StatBox label="Contacts" value={t.contacts} accent="#257de0" />
          <StatBox label="Birds" value={t.totalBirds} sub={`${t.cocks}♂ ${t.hens}♀ ${t.juvenile} juv`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <RatePill label="Coveys/hr" value={fmtRate(r.coveysPerHour)} />
          <RatePill label="Contacts/hr" value={fmtRate(r.contactsPerHour)} />
          <RatePill label="Shot vs seen" value={fmtPct(r.shotVsSeen)} />
          <RatePill label="% juvenile" value={fmtPct(r.pctJuvenile)} />
        </div>
        {hunt.comments && <p className="mt-3 whitespace-pre-wrap text-sm text-bark">{hunt.comments}</p>}
      </section>

      <section className="card mt-4">
        <h2 className="h-section mb-3">Dogs on this hunt</h2>
        {dogIds.length === 0 ? (
          <p className="text-sm text-bark">No dogs were recorded on this hunt.</p>
        ) : (
          <ul className="space-y-3">
            {dogIds.map((id) => {
              const run = hunt.dog_runs.find((d) => d.dog_id === id);
              const tr = tracks.find((x) => x.dog_id === id);
              const perHour = run && run.hours ? run.contacts / run.hours : null;
              const avg = seasonDog.get(id)?.perHour ?? null;
              const diff = perHour != null && avg ? (perHour - avg) / avg : null;
              return (
                <li key={id} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-ink/30" style={{ background: tr ? dogColor(id) : "#257de0" }} />
                    <span className="font-semibold">{dogName(id)}</span>
                    {diff != null && (
                      <span
                        className={`ml-auto pill ${Math.abs(diff) < 0.05 ? "" : diff > 0 ? "bg-forest-light text-forest-dark" : "bg-amber-100 text-amber-900"}`}
                        title="Contacts per hour on this hunt compared with this dog's season average"
                      >
                        {Math.abs(diff) < 0.05 ? "≈ season avg" : `${diff > 0 ? "▲" : "▼"} ${Math.abs(Math.round(diff * 100))}% vs season`}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    {[
                      [run?.contacts ?? "—", "contacts"],
                      [run?.hours ?? "—", "hours"],
                      [fmtRate(perHour), "contacts/hr"],
                      ...(tr
                        ? [
                            [metersToMiles(tr.distance_m).toFixed(1), "miles"],
                            [tr.moving_s ? (metersToMiles(tr.distance_m) / (tr.moving_s / 3600)).toFixed(1) : "—", "mph moving"],
                            [tr.duration_s ? `${Math.round((tr.moving_s / tr.duration_s) * 100)}%` : "—", "time moving"],
                          ]
                        : []),
                    ].map(([v, l]) => (
                      <div key={l} className="rounded-lg bg-sand py-1.5">
                        <div className="font-semibold tabular-nums text-ink">{v}</div>
                        <div className="text-bark">{l}</div>
                      </div>
                    ))}
                  </div>
                  {tr && (
                    <div className="mt-2 flex items-center text-xs text-bark">
                      <span>
                        Garmin track · {formatDuration(tr.duration_s)}
                        {tr.started_at && ` from ${new Date(tr.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                      </span>
                      {(canManage || tr.created_by === user.id) && (
                        <button className="ml-auto p-1" aria-label={`Remove ${dogName(id)}'s track`} onClick={() => removeTrack(tr)}>
                          <Icon name="delete" className="text-[18px]" />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card mt-4">
        <h2 className="h-section mb-2">Timeline</h2>
        {marks.length === 0 ? (
          <p className="text-sm text-bark">No GPS marks on this hunt. Marks come from Field Mode.</p>
        ) : (
          <ol className="divide-y divide-line text-sm">
            {marks.map((m) => {
              const near = tracks.length ? nearestDog(m.lat, m.lng, m.timestamp) : null;
              return (
                <li key={m.id} className="flex items-start gap-3 py-2">
                  <span className="w-16 shrink-0 tabular-nums text-bark">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white shadow" style={{ background: m.type === "covey" ? "#e76624" : "#257de0" }} />
                  <span className="flex-1">
                    {m.type === "covey" ? "Covey" : `Contact · ${dogName(m.dog_id)}`}
                    {near && (
                      <span className="block text-xs text-bark">
                        Nearest dog: {dogName(near.dogId)}, {Math.round(near.yards)} yd
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {!hunt._pending && canEditTracks && (
        <section className="card mt-4 space-y-3">
          <h2 className="h-section flex items-center gap-2">
            <Icon name="route" className="text-forest" /> Garmin tracks
          </h2>
          {tracksMissing ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              One-time database update needed. In Supabase → SQL Editor, run <code>{MIGRATION_SQL_FILE}</code>, then reload.
            </p>
          ) : (
            <>
              <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml" className="hidden" onChange={onFile} />
              <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()}>
                <Icon name="upload_file" /> Add Garmin tracks (GPX)
              </button>
              <p className="text-xs text-bark">
                From the Astro 430: connect it to a computer by USB and pick a file in its <strong>Garmin/GPX</strong> folder
                (Current.gpx holds recent tracks), or export the dog tracks from Garmin BaseCamp as GPX. Only the part
                recorded on {formatDate(hunt.date)} is kept.
              </p>
            </>
          )}
          {pending.length > 0 && (
            <div className="space-y-2">
              {pending.map((p) => {
                const s = trackStats(p.points);
                return (
                  <div key={p.key} className="rounded-xl border border-line p-3 text-sm">
                    <div className="mb-2 flex items-baseline gap-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="ml-auto text-xs text-bark">
                        {metersToMiles(s.distanceM).toFixed(1)} mi · {formatDuration(s.durationS)}
                        {p.trimmed && " · trimmed to hunt day"}
                      </span>
                    </div>
                    <select
                      className="input py-2 text-sm"
                      value={p.dogId}
                      onChange={(e) => setPending((cur) => cur.map((x) => (x.key === p.key ? { ...x, dogId: e.target.value } : x)))}
                      aria-label={`Dog for track ${p.name}`}
                    >
                      <option value="">Don&apos;t import</option>
                      {dogs.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                          {!d.active ? " (retired)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setPending([])}>
                  Cancel
                </button>
                <button className="btn-primary flex-1" disabled={busy || !pending.some((p) => p.dogId)} onClick={saveTracks}>
                  <Icon name="save" /> {busy ? "Saving…" : `Add ${pending.filter((p) => p.dogId).length} track(s)`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
