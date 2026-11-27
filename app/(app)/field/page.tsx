"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { useProperty } from "@/components/PropertyProvider";
import { Empty, ErrorNote } from "@/components/ui";
import { errorMessage } from "@/lib/data";
import { clearSession, loadSession, saveSession, type FieldSession, type SessionMark } from "@/lib/fieldSession";
import { formatCoord, getPosition, watchPosition, type Fix } from "@/lib/gps";
import { dequeueMark, enqueueMark } from "@/lib/markQueue";
import { useMarkQueue } from "@/components/QueueSync";
import { currentSeason } from "@/lib/seasons";
import { fetchConditions, huntWeatherFields } from "@/lib/weather";

const FRESH_FIX_MS = 20_000;

function elapsed(from: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function FieldPage() {
  const { sb, property, courses, activeDogs, courseName, dogName, canManage } = useProperty();
  const router = useRouter();
  const [session, setSession] = useState<FieldSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "covey" | "contact" | "start">(null);
  const [picker, setPicker] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fixRef = useRef<Fix | null>(null);
  const { queue, flush } = useMarkQueue();
  const queuedIds = new Set(queue.map((q) => q.id));

  useEffect(() => {
    setSession(loadSession(property.id));
    setLoaded(true);
  }, [property.id]);

  // GPS watch runs for the whole time Field Mode is open.
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Keep the screen awake during a hunt where supported.
  useEffect(() => {
    if (!session) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [session]);

  const update = (s: FieldSession | null) => {
    setSession(s);
    if (s) saveSession(s);
    else clearSession(property.id);
  };

  async function start() {
    if (!courseId) return;
    setBusy("start");
    setError(null);
    const s: FieldSession = {
      propertyId: property.id,
      courseId,
      startedAt: new Date().toISOString(),
      season: currentSeason(),
      marks: [],
    };
    if (property.lat != null && property.lng != null) {
      try {
        s.weather = huntWeatherFields(await fetchConditions(property.lat, property.lng));
      } catch {
        // Weather is a nice-to-have; the hunt form lets you retry.
      }
    }
    update(s);
    setBusy(null);
  }

  async function currentFix(): Promise<Fix> {
    const f = fixRef.current;
    if (f && Date.now() - f.timestamp < FRESH_FIX_MS) return f;
    return getPosition();
  }

  async function mark(type: "covey" | "contact", dogId: string | null = null) {
    if (!session) return;
    setBusy(type);
    setError(null);
    try {
      const f = await currentFix();
      const m: SessionMark = {
        id: crypto.randomUUID(),
        type,
        dogId,
        lat: f.lat,
        lng: f.lng,
        accuracy: f.accuracy,
        timestamp: new Date().toISOString(),
      };
      // Saved on the phone first, uploaded by QueueSync — works with no signal.
      enqueueMark({
        id: m.id,
        property_id: property.id,
        type,
        lat: m.lat,
        lng: m.lng,
        accuracy: m.accuracy,
        dog_id: dogId,
        course_id: session.courseId,
        season: session.season,
        timestamp: m.timestamp,
        hunt_id: null,
      });
      update({ ...session, marks: [...session.marks, m] });
      flush();
      navigator.vibrate?.(60);
      setFlash(type === "covey" ? "Covey marked" : `Contact: ${dogName(dogId)}`);
      setTimeout(() => setFlash(null), 1600);
    } catch (e) {
      setError(`Couldn't get a GPS fix: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
      setPicker(false);
    }
  }

  async function removeMark(id: string) {
    if (!session) return;
    if (!dequeueMark(property.id, id)) {
      const { error } = await sb.from("gps_marks").delete().eq("id", id);
      if (error) return setError(errorMessage(error));
    }
    update({ ...session, marks: session.marks.filter((m) => m.id !== id) });
  }

  function endHunt() {
    if (!session) return;
    update({ ...session, endedAt: new Date().toISOString() });
    router.push("/log?from=field");
  }

  async function discard() {
    if (!session) return;
    if (!confirm("Discard this hunt session? Marks already saved stay on the map but won't be attached to a hunt.")) return;
    update(null);
  }

  if (!loaded) return null;

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

  // ---- Start screen --------------------------------------------------------
  if (!session) {
    if (courses.length === 0) {
      return (
        <Empty icon="landscape" title="Add a course to start hunting">
          Field Mode marks coveys and contacts against a course.{" "}
          {canManage ? (
            <Link className="font-semibold text-forest underline" href="/manage">
              Add courses in Manage
            </Link>
          ) : (
            "Ask a manager to add courses."
          )}
        </Empty>
      );
    }
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="h-page">Field Mode</h1>
          {gpsBadge}
        </div>
        <ErrorNote error={error} />
        <div className="card">
          <span className="label">Select course</span>
          <div className="grid grid-cols-2 gap-2">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setCourseId(c.id)}
                className={`min-h-[56px] rounded-xl border px-3 py-2 text-left font-semibold transition ${
                  courseId === c.id ? "border-forest bg-forest text-white" : "border-line bg-white"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-primary h-16 w-full text-lg" disabled={!courseId || busy === "start"} onClick={start}>
          <Icon name="play_arrow" fill />
          {busy === "start" ? "Starting…" : "Start hunt"}
        </button>
        <p className="text-center text-xs text-bark">Weather is fetched automatically when the hunt starts.</p>
      </div>
    );
  }

  // ---- Active hunt ---------------------------------------------------------
  const coveys = session.marks.filter((m) => m.type === "covey").length;
  const contacts = session.marks.length - coveys;

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="card flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg">{courseName(session.courseId)}</div>
          <div className="text-xs text-bark">
            {elapsed(session.startedAt, now)} elapsed
            {session.weather && ` · ${session.weather.temperature} ${session.weather.weather} · ${session.weather.wind}`}
          </div>
        </div>
        {gpsBadge}
      </div>

      <ErrorNote error={error} />

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => mark("covey")}
          disabled={busy !== null}
          className="flex h-40 flex-col items-center justify-center gap-1 rounded-3xl bg-covey text-white shadow-lg transition active:scale-[0.97] disabled:opacity-60"
        >
          <Icon name={busy === "covey" ? "progress_activity" : "location_on"} fill className={`text-5xl ${busy === "covey" ? "animate-spin" : ""}`} />
          <span className="text-lg font-bold">Mark Covey</span>
          <span className="text-sm opacity-90">{coveys} this hunt</span>
        </button>
        <button
          onClick={() => setPicker(true)}
          disabled={busy !== null}
          className="flex h-40 flex-col items-center justify-center gap-1 rounded-3xl bg-contact text-white shadow-lg transition active:scale-[0.97] disabled:opacity-60"
        >
          <Icon name={busy === "contact" ? "progress_activity" : "pets"} fill className={`text-5xl ${busy === "contact" ? "animate-spin" : ""}`} />
          <span className="text-lg font-bold">Dog Contact</span>
          <span className="text-sm opacity-90">{contacts} this hunt</span>
        </button>
      </div>

      {flash && (
        <div className="rounded-xl bg-ink px-4 py-2 text-center text-sm font-semibold text-white">
          <Icon name="check_circle" className="mr-1 text-[18px]" />
          {flash}
        </div>
      )}

      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="font-semibold">Marks this session</span>
          <span className="pill">{session.marks.length}</span>
        </div>
        {session.marks.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-bark">Tap a button above to drop your first mark.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {[...session.marks].reverse().map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border-2 border-white shadow"
                  style={{ background: m.type === "covey" ? "#e76624" : "#257de0" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.type === "covey" ? "Covey" : `Contact · ${dogName(m.dogId)}`}</div>
                  <div className="truncate text-xs text-bark">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} ·{" "}
                    {formatCoord(m.lat, m.lng)}
                    {m.accuracy != null && ` ±${Math.round(m.accuracy)}m`}
                  </div>
                </div>
                <Icon
                  name={queuedIds.has(m.id) ? "cloud_off" : "cloud_done"}
                  className={`text-[18px] ${queuedIds.has(m.id) ? "text-amber-700" : "text-forest/60"}`}
                />
                <span className="sr-only">{queuedIds.has(m.id) ? "Waiting to upload" : "Uploaded"}</span>
                <button className="p-1 text-bark" aria-label="Remove mark" onClick={() => removeMark(m.id)}>
                  <Icon name="delete" className="text-[20px]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="btn-primary h-14 w-full text-base" onClick={endHunt}>
        <Icon name="flag" /> End hunt &amp; log details
      </button>
      <button className="btn-ghost w-full text-xs" onClick={discard}>
        Discard session
      </button>

      {picker && (
        <div className="fixed inset-0 z-[1100] flex items-end bg-black/40" onClick={() => setPicker(false)}>
          <div
            className="w-full rounded-t-3xl bg-white p-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center">
              <h2 className="h-section">Which dog?</h2>
              <button className="ml-auto p-1 text-bark" onClick={() => setPicker(false)} aria-label="Close">
                <Icon name="close" />
              </button>
            </div>
            {activeDogs.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-bark">No active dogs on this property yet.</p>
                <button className="btn-secondary w-full" onClick={() => mark("contact", null)}>
                  Record contact without a dog
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {activeDogs.map((d) => (
                  <button
                    key={d.id}
                    disabled={busy !== null}
                    onClick={() => mark("contact", d.id)}
                    className="min-h-[56px] rounded-2xl border-2 border-contact/30 bg-contact/5 px-3 text-base font-semibold text-contact active:bg-contact active:text-white"
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
