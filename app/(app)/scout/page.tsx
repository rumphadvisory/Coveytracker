"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { ExtraPoint } from "@/components/MapView";
import { useProperty } from "@/components/PropertyProvider";
import { useOutbox } from "@/components/QueueSync";
import { ErrorNote, OfflineNote } from "@/components/ui";
import { useMarks } from "@/components/useCounts";
import { formatAcres, propertyAreas } from "@/lib/areas";
import { ALL, errorMessage } from "@/lib/data";
import { containsPoint } from "@/lib/geo";
import { formatCoord, getPosition, watchPosition, type Fix } from "@/lib/gps";
import { isNetworkError, enqueue, insertOp, removeQueuedRow } from "@/lib/outbox";
import {
  COVEY_HOW,
  COVEY_SIZES,
  NOTE_CATEGORIES,
  NOTE_ORDER,
  isNoteCategory,
  planText,
  scoutTitle,
  scoutingPlan,
  type CoveyHow,
  type NoteCategory,
} from "@/lib/scouting";
import { seasonForDate } from "@/lib/seasons";
import type { GpsMarkRow } from "@/types/database";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-sand-dark" />,
});

const FRESH_FIX_MS = 20_000;
const COVEY = "#e76624";

const MIGRATION_SQL = `alter table public.gps_marks drop constraint if exists gps_marks_type_check;
alter table public.gps_marks add constraint gps_marks_type_check check (type in ('covey', 'contact', 'scout'));
alter table public.gps_marks add column if not exists category text;
alter table public.gps_marks add column if not exists birds int check (birds is null or birds between 1 and 60);
notify pgrst, 'reload schema';`;

type Tab = "record" | "map" | "plan";
type Sheet =
  | { kind: "covey"; fix: Fix; how: CoveyHow; birds: number | null; note: string }
  | { kind: "note"; fix: Fix; category: NoteCategory | null; note: string };

const time = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function ScoutPage() {
  const { sb, property, courses, courseName, dogName, canManage } = useProperty();
  const { marks: loaded, error: loadError, offline } = useMarks(ALL);
  const { ops, flush } = useOutbox();
  const [tab, setTab] = useState<Tab>("record");
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState<null | "covey" | "note">(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const fixRef = useRef<Fix | null>(null);

  useEffect(
    () =>
      watchPosition(
        (f) => {
          fixRef.current = f;
          setFix(f);
          setGpsError(null);
        },
        (msg) => setGpsError(msg),
      ),
    [],
  );

  // Scouting needs two new columns; check once when online so we can show the one-time SQL.
  useEffect(() => {
    let live = true;
    sb.from("gps_marks")
      .select("category,birds")
      .eq("property_id", property.id)
      .limit(1)
      .then(({ error }) => {
        if (!live) return;
        if (!error) setDbReady(true);
        else if (!isNetworkError(error)) setDbReady(false);
      });
    return () => {
      live = false;
    };
  }, [sb, property.id]);

  const marks = useMemo(() => (loaded ?? []).filter((m) => !removed.has(m.id)), [loaded, removed]);
  const coveys = useMemo(() => marks.filter((m) => m.type === "covey"), [marks]);
  const notes = useMemo(() => marks.filter((m) => m.type === "scout"), [marks]);
  // What was recorded in Scout (coveys with how-found, and notes), newest first.
  const scouted = useMemo(
    () => marks.filter((m) => m.type === "scout" || (m.type === "covey" && m.category)).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [marks],
  );
  const queuedIds = new Set(ops.filter((o) => o.kind === "insert" && o.table === "gps_marks").map((o) => o.id));
  const stuck = ops.some((o) => o.table === "gps_marks" && o.lastError);

  const center = useMemo(
    () => (property.lat != null && property.lng != null ? { lat: property.lat, lng: property.lng } : coveys[0] ?? { lat: 0, lng: 0 }),
    [property.lat, property.lng, coveys],
  );
  const plan = useMemo(
    () => scoutingPlan({ coveys, notes, boundary: property.boundary ?? null, center, courses }),
    [coveys, notes, property.boundary, center, courses],
  );
  const areas = useMemo(() => propertyAreas(property, courses), [property, courses]);
  const notePoints = useMemo<ExtraPoint[]>(
    () =>
      notes.map((n) => ({
        id: n.id,
        lat: n.lat,
        lng: n.lng,
        title: scoutTitle(n),
        lines: [time(n.timestamp), ...(n.notes ? [n.notes] : [])],
        color: NOTE_CATEGORIES[isNoteCategory(n.category) ? n.category : "other"].color,
      })),
    [notes],
  );

  async function currentFix(): Promise<Fix> {
    const f = fixRef.current;
    if (f && Date.now() - f.timestamp < FRESH_FIX_MS) return f;
    return getPosition();
  }

  /** The spot is taken when the button is tapped, then details are filled in. */
  async function open(kind: "covey" | "note") {
    setBusy(kind);
    setError(null);
    try {
      const f = await currentFix();
      navigator.vibrate?.(40);
      setSheet(
        kind === "covey"
          ? { kind, fix: f, how: "seen", birds: null, note: "" }
          : { kind, fix: f, category: null, note: "" },
      );
    } catch (e) {
      setError(`Couldn't get a GPS fix: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  function save() {
    if (!sheet) return;
    if (sheet.kind === "note" && !sheet.category) return;
    const ts = new Date().toISOString();
    const row: Partial<GpsMarkRow> & Pick<GpsMarkRow, "id" | "property_id" | "type" | "lat" | "lng" | "season"> = {
      id: crypto.randomUUID(),
      property_id: property.id,
      type: sheet.kind === "covey" ? "covey" : "scout",
      category: sheet.kind === "covey" ? sheet.how : sheet.category,
      birds: sheet.kind === "covey" ? sheet.birds : null,
      lat: sheet.fix.lat,
      lng: sheet.fix.lng,
      accuracy: sheet.fix.accuracy,
      season: seasonForDate(new Date(ts)),
      timestamp: ts,
      notes: sheet.note.trim() || null,
      hunt_id: null,
      dog_id: null,
      // If you happen to be inside a course outline, file it under that course too.
      course_id: courses.find((c) => containsPoint(c.boundary, sheet.fix.lat, sheet.fix.lng))?.id ?? null,
    };
    // Saved on the phone first and uploaded in the background — works with no signal.
    enqueue(property.id, insertOp(property.id, "gps_marks", row));
    flush();
    setFlash(sheet.kind === "covey" ? "Covey saved" : `${NOTE_CATEGORIES[sheet.category!].label} saved`);
    setTimeout(() => setFlash(null), 1600);
    setSheet(null);
  }

  async function remove(m: GpsMarkRow) {
    if (!confirm(`Delete this ${scoutTitle(m).toLowerCase()}?`)) return;
    if (!removeQueuedRow(property.id, m.id)) {
      const { error } = await sb.from("gps_marks").delete().eq("id", m.id);
      if (error) return setError(errorMessage(error));
    }
    setRemoved((s) => new Set(s).add(m.id));
  }

  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(planText(property.name, plan));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy on this device.");
    }
  }

  const gpsBadge = (
    <div
      className={`flex items-center gap-1 text-xs font-medium ${
        gpsError ? "text-red-700" : fix ? (fix.accuracy <= 20 ? "text-forest" : "text-amber-700") : "text-bark"
      }`}
    >
      <Icon name={gpsError ? "location_disabled" : fix ? "gps_fixed" : "gps_not_fixed"} className="text-[18px]" />
      {gpsError ?? (fix ? `GPS ±${Math.round(fix.accuracy)} m` : "Finding GPS…")}
    </div>
  );

  const list = showAll ? scouted : scouted.slice(0, 12);

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="h-page flex items-center gap-2">
          <Icon name="explore" className="text-forest" /> Scout
        </h1>
        {gpsBadge}
      </div>
      <p className="-mt-1 text-sm text-bark">
        Map coveys and habitat on {property.name}. No hunt, dog or course needed, and it works with no signal.
      </p>

      {dbReady === false && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="database" /> One-time database update needed
          </div>
          <p>
            Scouting marks are saved on this phone and will upload once this runs. {canManage ? "In" : "Ask the owner to open"}{" "}
            Supabase → <strong>SQL Editor → New query</strong>, paste the lines below and click <strong>Run</strong>.
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-xs text-ink">{MIGRATION_SQL}</pre>
          <button
            type="button"
            className="btn-secondary min-h-0 py-1.5 text-xs"
            onClick={() => navigator.clipboard?.writeText(MIGRATION_SQL).catch(() => {})}
          >
            <Icon name="content_copy" className="text-[16px]" /> Copy SQL
          </button>
        </div>
      )}
      {stuck && dbReady !== false && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Some marks haven&apos;t uploaded yet. They&apos;re safe on this phone and will retry automatically.
        </p>
      )}
      <ErrorNote error={error ?? loadError} />
      <OfflineNote show={offline} />

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-sand-dark/60 p-1 text-sm font-semibold">
        {(
          [
            ["record", "add_location_alt", "Record"],
            ["map", "map", "Map"],
            ["plan", "checklist", "Plan"],
          ] as const
        ).map(([t, icon, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center justify-center gap-1 rounded-lg py-2 ${tab === t ? "bg-white text-forest-dark shadow" : "text-bark"}`}
          >
            <Icon name={icon} className="text-[18px]" /> {label}
          </button>
        ))}
      </div>

      {tab === "record" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => open("covey")}
              disabled={busy !== null}
              className="flex h-36 flex-col items-center justify-center gap-1 rounded-3xl bg-covey text-white shadow-lg transition active:scale-[0.97] disabled:opacity-60"
            >
              <Icon name={busy === "covey" ? "progress_activity" : "location_on"} fill className={`text-5xl ${busy === "covey" ? "animate-spin" : ""}`} />
              <span className="text-lg font-bold">Covey</span>
              <span className="text-xs opacity-90">Seen, heard or flushed</span>
            </button>
            <button
              onClick={() => open("note")}
              disabled={busy !== null}
              className="flex h-36 flex-col items-center justify-center gap-1 rounded-3xl bg-forest text-white shadow-lg transition active:scale-[0.97] disabled:opacity-60"
            >
              <Icon name={busy === "note" ? "progress_activity" : "edit_location_alt"} fill className={`text-5xl ${busy === "note" ? "animate-spin" : ""}`} />
              <span className="text-lg font-bold">Habitat note</span>
              <span className="text-xs opacity-90">Cover, burn, food, sign…</span>
            </button>
          </div>

          {flash && (
            <div className="rounded-xl bg-ink px-4 py-2 text-center text-sm font-semibold text-white">
              <Icon name="check_circle" className="mr-1 text-[18px]" />
              {flash}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Coveys" value={plan.coveys} />
            <Stat label="Notes" value={notes.length} />
            <Stat label="Hotspots" value={plan.hotspots.length} />
          </div>

          <div className="card p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-semibold">Scouting log</span>
              <span className="pill">{scouted.length}</span>
            </div>
            {scouted.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-bark">
                Walk the property and tap <strong>Covey</strong> or <strong>Habitat note</strong> where you are. The spot is
                taken from your GPS when you tap.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((m) => {
                  const info = m.type === "scout" ? NOTE_CATEGORIES[isNoteCategory(m.category) ? m.category : "other"] : null;
                  const pending = queuedIds.has(m.id);
                  return (
                    <li key={m.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                      <span
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ background: info?.color ?? COVEY }}
                      >
                        <Icon name={info?.icon ?? "location_on"} fill className="text-[16px]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {scoutTitle(m)}
                          {m.birds ? <span className="font-normal text-bark"> · ~{m.birds} birds</span> : null}
                        </div>
                        {m.notes && <div className="text-ink/80">{m.notes}</div>}
                        <div className="truncate text-xs text-bark">
                          {time(m.timestamp)} · {formatCoord(m.lat, m.lng)}
                          {m.accuracy != null && ` ±${Math.round(m.accuracy)}m`}
                        </div>
                      </div>
                      <Icon
                        name={pending ? "cloud_off" : "cloud_done"}
                        className={`mt-1 text-[18px] ${pending ? "text-amber-700" : "text-forest/60"}`}
                      />
                      <span className="sr-only">{pending ? "Waiting to upload" : "Uploaded"}</span>
                      <button className="p-1 text-bark" aria-label="Delete" onClick={() => remove(m)}>
                        <Icon name="delete" className="text-[20px]" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {scouted.length > list.length && (
              <button className="w-full border-t border-line py-2 text-sm font-semibold text-forest" onClick={() => setShowAll(true)}>
                Show all {scouted.length}
              </button>
            )}
          </div>
        </>
      )}

      {tab === "map" && (
        <>
          <MapView
            className="h-[calc(100dvh-340px)] min-h-[340px]"
            marks={coveys}
            extraPoints={notePoints}
            fix={fix}
            areas={areas}
            home={property.lat != null && property.lng != null ? { lat: property.lat, lng: property.lng } : null}
            courseName={courseName}
            dogName={dogName}
            showLegend={false}
            fitKey={`scout|${property.id}`}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-bark">
            <Legend color={COVEY} label={`Covey (${coveys.length})`} />
            {NOTE_ORDER.filter((c) => notes.some((n) => (isNoteCategory(n.category) ? n.category : "other") === c)).map((c) => (
              <Legend key={c} color={NOTE_CATEGORIES[c].color} label={NOTE_CATEGORIES[c].label} />
            ))}
          </div>
          <p className="text-xs text-bark">Covey dots include coveys marked on hunts. Tap a dot for details.</p>
        </>
      )}

      {tab === "plan" && (
        <div className="space-y-3">
          <section className="card space-y-2">
            <h2 className="h-section">Where things stand</h2>
            <ul className="space-y-1.5 text-sm">
              <li>
                <strong>{plan.coveys}</strong> covey{plan.coveys === 1 ? "" : "s"} located
                {plan.coveys > 0 && (
                  <span className="text-bark">
                    {" "}
                    (seen {plan.byHow.seen}, heard {plan.byHow.heard}, flushed {plan.byHow.flushed}
                    {plan.byHow.other ? `, on hunts ${plan.byHow.other}` : ""})
                  </span>
                )}
              </li>
              {plan.birdsCounted != null && (
                <li>
                  About <strong>{plan.birdsCounted}</strong> birds on the coveys you sized
                </li>
              )}
              {plan.acres != null ? (
                <li>
                  <strong>{formatAcres(plan.acres)}</strong>
                  {plan.acresPerCovey != null && (
                    <>
                      , one covey found per <strong>{Math.round(plan.acresPerCovey)} acres</strong>
                    </>
                  )}
                  <div className="text-xs text-bark">
                    For comparison, intensively managed quail ground often holds about one covey per 10–12 acres by fall.
                  </div>
                </li>
              ) : (
                <li className="text-bark">
                  Outline the property on{" "}
                  <Link href="/boundaries" className="font-semibold text-forest underline">
                    Boundaries
                  </Link>{" "}
                  to see acreage and density.
                </li>
              )}
              {plan.unscouted != null && (
                <li>
                  <strong>{Math.round(plan.unscouted * 100)}%</strong> of the property has nothing recorded within a quarter mile
                </li>
              )}
            </ul>
          </section>

          <section className="card space-y-2">
            <h2 className="h-section">Covey hotspots</h2>
            {plan.hotspots.length === 0 ? (
              <p className="text-sm text-bark">
                Hotspots appear where two or more coveys are within about a quarter mile of each other. They&apos;re where
                courses should go.
              </p>
            ) : (
              <ol className="space-y-2">
                {plan.hotspots.map((h, i) => (
                  <li key={`${h.lat},${h.lng}`} className="flex items-start gap-3 text-sm">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-covey font-bold text-white">{i + 1}</span>
                    <div>
                      <div className="font-semibold">
                        {h.n} coveys · {h.where === "center" ? "center of the property" : `${h.where} side`}
                      </div>
                      <div className="text-xs text-bark">
                        Within {Math.max(100, Math.round(h.radiusM / 50) * 50)} m of {formatCoord(h.lat, h.lng)}
                        {h.birds ? ` · ~${h.birds} birds counted` : ""}
                        {h.course ? ` · already in ${h.course}` : " · no course yet"}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {plan.lone > 0 && <p className="text-xs text-bark">Plus {plan.lone} single covey{plan.lone === 1 ? "" : "s"} on their own.</p>}
          </section>

          {plan.habitat.length > 0 && (
            <section className="card space-y-3">
              <h2 className="h-section">Habitat work</h2>
              {plan.habitat.map((g) => (
                <div key={g.category} className="flex items-start gap-3 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white" style={{ background: g.info.color }}>
                    <Icon name={g.info.icon} fill className="text-[16px]" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {g.info.label} <span className="font-normal text-bark">· {g.count}</span>
                    </div>
                    <div className="text-bark">{g.info.action}</div>
                    {g.notes.length > 0 && (
                      <ul className="mt-1 list-disc pl-4 text-xs text-ink/80">
                        {g.notes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="card space-y-2 border-forest/30 bg-forest-light/40">
            <h2 className="h-section">Development plan: next steps</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {plan.steps.map((s, i) => (
                <li key={i}>
                  {s.text}
                  {s.href && (
                    <>
                      {" "}
                      <Link href={s.href} className="font-semibold text-forest underline">
                        Open
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <button className="btn-secondary w-full" onClick={copyPlan}>
            <Icon name={copied ? "check" : "content_copy"} /> {copied ? "Copied" : "Copy plan to share"}
          </button>
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[1100] flex items-end bg-black/40" onClick={() => setSheet(null)}>
          <div
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center">
              <h2 className="h-section">{sheet.kind === "covey" ? "Covey" : "Habitat note"}</h2>
              <button className="ml-auto p-1 text-bark" onClick={() => setSheet(null)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            <p className="mb-3 text-xs text-bark">
              <Icon name="gps_fixed" className="text-[14px]" /> {formatCoord(sheet.fix.lat, sheet.fix.lng)} ±{Math.round(sheet.fix.accuracy)} m
            </p>

            {sheet.kind === "covey" ? (
              <>
                <span className="label">How did you find it?</span>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {COVEY_HOW.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setSheet({ ...sheet, how: h.id })}
                      className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border text-sm font-semibold ${
                        sheet.how === h.id ? "border-covey bg-covey text-white" : "border-line bg-white"
                      }`}
                    >
                      <Icon name={h.icon} className="text-[20px]" />
                      {h.label}
                    </button>
                  ))}
                </div>
                <span className="label">About how many birds?</span>
                <div className="mb-3 flex flex-wrap gap-2">
                  {COVEY_SIZES.map((n) => (
                    <button
                      key={String(n)}
                      onClick={() => setSheet({ ...sheet, birds: n })}
                      className={`chip ${sheet.birds === n ? "border-covey bg-covey text-white" : ""}`}
                    >
                      {n == null ? "Not sure" : n === 25 ? "25+" : n}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span className="label">What is it?</span>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {NOTE_ORDER.map((c) => {
                    const info = NOTE_CATEGORIES[c];
                    const on = sheet.category === c;
                    return (
                      <button
                        key={c}
                        onClick={() => setSheet({ ...sheet, category: c })}
                        className={`flex min-h-[48px] items-center gap-2 rounded-xl border px-2.5 text-left text-sm font-semibold ${
                          on ? "text-white" : "border-line bg-white"
                        }`}
                        style={on ? { background: info.color, borderColor: info.color } : undefined}
                      >
                        <span style={on ? undefined : { color: info.color }}>
                          <Icon name={info.icon} fill className="text-[20px]" />
                        </span>
                        <span className="leading-tight">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <label className="label" htmlFor="scout-note">
              Note (optional)
            </label>
            <textarea
              id="scout-note"
              rows={2}
              className="input mb-3"
              placeholder={sheet.kind === "covey" ? "e.g. ran into the plum thicket by the pond" : "e.g. broomsedge too thick, burn this spring"}
              value={sheet.note}
              onChange={(e) => setSheet({ ...sheet, note: e.target.value })}
            />
            <button className="btn-primary h-14 w-full text-base" disabled={sheet.kind === "note" && !sheet.category} onClick={save}>
              <Icon name="check" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-2 py-2.5">
      <div className="font-display text-2xl">{value}</div>
      <div className="text-xs text-bark">{label}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full border border-white shadow" style={{ background: color }} />
      {label}
    </span>
  );
}
