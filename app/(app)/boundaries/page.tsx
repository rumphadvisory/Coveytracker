"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { MapArea } from "@/components/MapView";
import { useProperty } from "@/components/PropertyProvider";
import { ErrorNote, PageHeader } from "@/components/ui";
import { formatAcres, propertyAreas } from "@/lib/areas";
import { BOUNDARY_FILE_TYPES, readBoundaryFile } from "@/lib/boundaryFiles";
import { errorMessage } from "@/lib/data";
import { boundsCenter, parsePointList, shapeAcres, shapesBounds, totalAcres, type BoundaryShape } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-sand-dark" />,
});

type Assign = "property" | "new" | "skip" | `course:${string}`;
interface Item {
  key: string;
  shape: BoundaryShape;
  assign: Assign;
  newName: string;
}
type Mode = "upload" | "paste" | "draw";

const PREVIEW_COLOR = "#e76624";
const MIGRATION = "supabase/migrations/20261128000000_boundaries.sql";

const draftKey = (propertyId: string) => `ct:boundary-draft:${propertyId}`;

function loadDrafts(propertyId: string): Item[] {
  try {
    const raw = localStorage.getItem(draftKey(propertyId));
    return raw ? (JSON.parse(raw) as Item[]) : [];
  } catch {
    return [];
  }
}

function saveDrafts(propertyId: string, items: Item[]) {
  try {
    if (items.length) localStorage.setItem(draftKey(propertyId), JSON.stringify(items));
    else localStorage.removeItem(draftKey(propertyId));
  } catch {}
}

const MIGRATION_SQL = `alter table public.properties add column if not exists boundary jsonb;
alter table public.courses    add column if not exists boundary jsonb;`;

function friendlySaveError(e: unknown): string {
  const m = errorMessage(e);
  return /boundary/i.test(m) && /column|schema/i.test(m)
    ? `The database needs a one-time update for boundaries. In Supabase, open SQL Editor and run ${MIGRATION}, then try again.`
    : m;
}

export default function BoundariesPage() {
  const { sb, property, courses, canManage, reloadRoster, reloadMemberships } = useProperty();
  const [mode, setMode] = useState<Mode>("upload");
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [drawing, setDrawing] = useState(false);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Unsaved outlines belong to this property: keep them on the phone across property switches
  // and reloads, and never let them carry over to another property.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    setItems(loadDrafts(property.id));
    setDraft([]);
    setDrawing(false);
    setSaveResult(null);
    setError(null);
    setNotice(null);
    loadedFor.current = property.id;
  }, [property.id]);
  useEffect(() => {
    if (loadedFor.current === property.id) saveDrafts(property.id, items);
  }, [items, property.id]);
  useEffect(() => {
    if (!items.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [items.length]);

  // Has the one-time boundaries database update been run? (The column is missing otherwise.)
  const dbReady = "boundary" in property;

  function startDrawing() {
    setDraft([]);
    setDrawing(true);
    // The controls are below the map; bring the map itself into view for tapping.
    requestAnimationFrame(() => mapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  /** Guess where an outline belongs: a course with the same name, else the property if it has none, else a new course. */
  function suggest(shape: BoundaryShape, isOnly: boolean): Assign {
    const name = shape.name.trim().toLowerCase();
    const match = courses.find((c) => c.name.trim().toLowerCase() === name);
    if (match) return `course:${match.id}`;
    if (!property.boundary?.length && (isOnly || /boundary|property|parcel|tract|farm|plantation|survey/i.test(name)))
      return "property";
    return "new";
  }

  function addShapes(shapes: BoundaryShape[]) {
    setItems((cur) => [
      ...cur,
      ...shapes.map((shape) => ({
        key: crypto.randomUUID(),
        shape,
        assign: suggest(shape, shapes.length === 1 && cur.length === 0),
        newName: shape.name,
      })),
    ]);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const shapes = await readBoundaryFile(file);
      if (!shapes.length) return setError(`No outlines found in ${file.name}. It needs polygons, closed lines or a track.`);
      addShapes(shapes);
    } catch (err) {
      setError(`Couldn't read ${file.name}: ${errorMessage(err)}`);
    }
  }

  function onPaste() {
    setError(null);
    const { shapes, badLines } = parsePointList(paste, "Pasted area");
    if (!shapes.length) return setError("Need at least 3 points (one per line) to make an outline.");
    addShapes(shapes);
    setPaste("");
    if (badLines.length) setNotice(`Skipped line${badLines.length > 1 ? "s" : ""} ${badLines.join(", ")}: not a coordinate.`);
  }

  function finishDrawing() {
    if (draft.length < 3) return;
    // Number drawn outlines 1, 2, 3… across what's waiting and what's already saved.
    const used = [...items.map((i) => i.shape.name), ...courses.map((c) => c.name), ...(property.boundary ?? []).map((p) => p.name)];
    let n = 1;
    while (used.includes(`Drawn area ${n}`)) n++;
    addShapes([{ name: `Drawn area ${n}`, rings: [draft.map(([lat, lng]) => [lng, lat] as [number, number])] }]);
    setDraft([]);
    setDrawing(false);
  }

  const update = (key: string, patch: Partial<Item>) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setSaveResult(null);
    const denied = () =>
      new Error("The change wasn't saved: only the property's owner or a manager can change outlines.");
    try {
      const toProperty = items.filter((i) => i.assign === "property").map((i) => i.shape);
      if (toProperty.length) {
        const boundary = [...(property.boundary ?? []), ...toProperty];
        const patch: { boundary: BoundaryShape[]; lat?: number; lng?: number } = { boundary };
        // No center yet? Use the middle of the outline.
        if (property.lat == null || property.lng == null) {
          const c = boundsCenter(shapesBounds(boundary)!);
          patch.lat = +c.lat.toFixed(6);
          patch.lng = +c.lng.toFixed(6);
        }
        const { data, error } = await sb.from("properties").update(patch).eq("id", property.id).select("id");
        if (error) throw error;
        if (!data?.length) throw denied(); // access rules block silently: zero rows changed
      }
      // Existing courses: the outline(s) assigned replace the old one; acres follow the outline.
      const byCourse = new Map<string, BoundaryShape[]>();
      for (const i of items)
        if (i.assign.startsWith("course:")) {
          const id = i.assign.slice(7);
          byCourse.set(id, [...(byCourse.get(id) ?? []), i.shape]);
        }
      for (const [id, shapes] of byCourse) {
        const { data, error } = await sb
          .from("courses")
          .update({ boundary: shapes, acres: +totalAcres(shapes).toFixed(1) })
          .eq("id", id)
          .select("id");
        if (error) throw error;
        if (!data?.length) throw denied();
      }
      const fresh = items.filter((i) => i.assign === "new");
      if (fresh.length) {
        const { error } = await sb.from("courses").insert(
          fresh.map((i) => ({
            property_id: property.id,
            name: i.newName.trim() || i.shape.name,
            boundary: [{ ...i.shape, name: i.newName.trim() || i.shape.name }],
            acres: +shapeAcres(i.shape).toFixed(1),
          })),
        );
        if (error) throw error;
      }
      const saved = items.filter((i) => i.assign !== "skip").length;
      setItems([]);
      await Promise.all([reloadRoster(), reloadMemberships()]);
      const text = `Saved ${saved} outline${saved === 1 ? "" : "s"}. They're on the map now.`;
      setNotice(text);
      setSaveResult({ ok: true, text });
    } catch (e) {
      const text = friendlySaveError(e);
      setError(text);
      setSaveResult({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  async function removeParcel(index: number) {
    const parcel = property.boundary?.[index];
    if (!parcel || !confirm(`Remove the outline "${parcel.name}" from ${property.name}?`)) return;
    const boundary = (property.boundary ?? []).filter((_, i) => i !== index);
    const { error } = await sb.from("properties").update({ boundary: boundary.length ? boundary : null }).eq("id", property.id);
    if (error) return setError(friendlySaveError(error));
    reloadMemberships();
  }

  async function removeCourseOutline(id: string, name: string) {
    if (!confirm(`Remove the outline for ${name}? The course and its hunts stay.`)) return;
    const { error } = await sb.from("courses").update({ boundary: null }).eq("id", id);
    if (error) return setError(friendlySaveError(error));
    reloadRoster();
  }

  const areas = useMemo<MapArea[]>(
    () => [
      ...propertyAreas(property, courses),
      ...items
        .filter((i) => i.assign !== "skip")
        .map((i) => ({
          id: i.key,
          label: `${i.assign === "new" ? i.newName : i.shape.name} · ${formatAcres(shapeAcres(i.shape))}`,
          color: PREVIEW_COLOR,
          shapes: [i.shape],
          kind: "preview" as const,
        })),
    ],
    [property, courses, items],
  );

  const outlinedCourses = courses.filter((c) => c.boundary?.length);
  const home = property.lat != null && property.lng != null ? { lat: property.lat, lng: property.lng } : null;

  return (
    <>
      <PageHeader title="Boundaries" icon="polyline" />
      <ErrorNote error={error} />
      {!dbReady && canManage && (
        <div className="mb-3 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <Icon name="database" /> One-time database update needed
          </div>
          <p>
            Outlines can&apos;t be saved until this runs. In Supabase, open <strong>SQL Editor → New query</strong>, paste
            the two lines below, click <strong>Run</strong>, then reload this page.
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
      {notice && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-forest-light p-3 text-sm text-forest-dark">
          <Icon name="check_circle" /> {notice}
        </div>
      )}

      <div ref={mapRef} className="scroll-mt-24">
      <MapView
        showLegend={false}
        overlay={
          drawing ? (
            <div className="flex items-center gap-2 rounded-xl bg-white/95 p-2 shadow">
              <span className="flex-1 px-1 text-xs font-semibold text-ink">
                Tap each corner · {draft.length} point{draft.length === 1 ? "" : "s"}
              </span>
              <button type="button" className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs" disabled={!draft.length} onClick={() => setDraft((d) => d.slice(0, -1))}>
                <Icon name="undo" className="text-[16px]" /> Undo
              </button>
              <button type="button" className="btn-secondary min-h-0 px-2.5 py-1.5 text-xs" onClick={() => (setDraft([]), setDrawing(false))}>
                Cancel
              </button>
              <button type="button" className="btn-primary min-h-0 px-2.5 py-1.5 text-xs" disabled={draft.length < 3} onClick={finishDrawing}>
                <Icon name="check" className="text-[16px]" /> Done
              </button>
            </div>
          ) : undefined
        }
        className={`h-[55vh] min-h-[320px] ${drawing ? "ring-4 ring-covey" : ""}`}
        marks={[]}
        courseName={() => ""}
        dogName={() => ""}
        home={home}
        areas={areas}
        draft={drawing ? draft : undefined}
        onMapClick={drawing ? (lat, lng) => setDraft((d) => [...d, [lat, lng]]) : undefined}
        fitKey={`${property.id}|${areas.map((a) => a.id).join(",")}`}
      />
      </div>

      {canManage && (
        <section className="card mt-4 space-y-3">
          <h2 className="h-section">Add outlines</h2>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-sand p-1 text-sm font-semibold">
            {(
              [
                ["upload", "upload_file", "Upload file"],
                ["paste", "content_paste", "Paste points"],
                ["draw", "draw", "Draw on map"],
              ] as const
            ).map(([m, icon, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2 ${mode === m ? "bg-white text-forest-dark shadow-sm" : "text-bark"}`}
              >
                <Icon name={icon} className="text-[18px]" /> <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {mode === "upload" && (
            <div className="space-y-2">
              <input ref={fileRef} type="file" accept={BOUNDARY_FILE_TYPES} className="hidden" onChange={onFile} />
              <button type="button" className="btn-primary w-full" onClick={() => fileRef.current?.click()}>
                <Icon name="upload_file" /> Choose a file
              </button>
              <p className="text-xs text-bark">
                KML or KMZ from Google Earth or onX Hunt, GPX from a Garmin, or GeoJSON from a surveyor or county GIS.
                Every outline in the file is listed below for you to assign.
              </p>
            </div>
          )}

          {mode === "paste" && (
            <div className="space-y-2">
              <textarea
                className="input font-mono text-sm"
                rows={6}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={"31.9466, -85.6450\n31.9502, -85.6450\n31.9502, -85.6391\n31.9466, -85.6391"}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="button" className="btn-primary w-full" disabled={!paste.trim()} onClick={onPaste}>
                <Icon name="polyline" /> Make outline
              </button>
              <p className="text-xs text-bark">
                One corner per line, in order around the edge. Any format works (31.9466 N 85.645 W, or degrees-minutes-seconds).
                Leave a blank line between separate areas.
              </p>
            </div>
          )}

          {mode === "draw" && (
            <div className="space-y-2">
              <button type="button" className="btn-primary w-full" disabled={drawing} onClick={startDrawing}>
                <Icon name="draw" /> {drawing ? "Drawing… tap corners on the map" : "Start drawing"}
              </button>
              <p className="text-xs text-bark">
                Tap each corner on the map in order around the edge, then Done. Switch to <strong>Hybrid</strong> to see
                roads, fences and tree lines.
              </p>
            </div>
          )}
        </section>
      )}

      {items.length > 0 && (
        <section className="card mt-4 space-y-3">
          <h2 className="h-section">Assign outlines</h2>
          <p className="text-xs text-bark">Shown dashed in orange on the map. Choose where each one belongs, then save.</p>
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.key} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-sm border-2 border-dashed" style={{ borderColor: PREVIEW_COLOR }} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{i.shape.name}</span>
                  <span className="pill">{formatAcres(shapeAcres(i.shape))}</span>
                  <button type="button" className="p-1 text-bark" aria-label={`Discard ${i.shape.name}`} onClick={() => setItems((c) => c.filter((x) => x.key !== i.key))}>
                    <Icon name="close" />
                  </button>
                </div>
                <select className="input py-2 text-sm" value={i.assign} onChange={(e) => update(i.key, { assign: e.target.value as Assign })}>
                  <option value="property">Property boundary (add as a parcel)</option>
                  {courses.map((c) => (
                    <option key={c.id} value={`course:${c.id}`}>
                      Course: {c.name}
                      {c.boundary?.length ? " (replace outline)" : ""}
                    </option>
                  ))}
                  <option value="new">New course…</option>
                  <option value="skip">Don&apos;t use</option>
                </select>
                {i.assign === "new" && (
                  <input
                    className="input mt-2 py-2 text-sm"
                    value={i.newName}
                    onChange={(e) => update(i.key, { newName: e.target.value })}
                    placeholder="Course name"
                    aria-label="New course name"
                  />
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !dbReady || items.every((i) => i.assign === "skip")}
            onClick={save}
          >
            <Icon name="save" /> {busy ? "Saving…" : "Save outlines"}
          </button>
        </section>
      )}

      <section className="card mt-4 space-y-3">
        <h2 className="h-section">On this property</h2>
        {!property.boundary?.length && !outlinedCourses.length ? (
          <p className="text-sm text-bark">No outlines yet. Upload a file, paste points or draw one above.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {(property.boundary ?? []).map((p, idx) => (
              <li key={`p${idx}`} className="flex items-center gap-2 py-2">
                <span className="h-3 w-3 shrink-0 rounded-sm border-2 border-ink bg-white" />
                <span className="min-w-0 flex-1 truncate">
                  <strong>Property</strong> · {p.name}
                </span>
                <span className="text-bark">{formatAcres(shapeAcres(p))}</span>
                {canManage && (
                  <button type="button" className="p-1 text-bark" aria-label={`Remove ${p.name}`} onClick={() => removeParcel(idx)}>
                    <Icon name="delete" className="text-[20px]" />
                  </button>
                )}
              </li>
            ))}
            {outlinedCourses.map((c) => {
              const a = areas.find((x) => x.id === `course:${c.id}`);
              return (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: a?.color }} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-bark">{formatAcres(totalAcres(c.boundary))}</span>
                  {canManage && (
                    <button type="button" className="p-1 text-bark" aria-label={`Remove outline for ${c.name}`} onClick={() => removeCourseOutline(c.id, c.name)}>
                      <Icon name="delete" className="text-[20px]" />
                    </button>
                  )}
                </li>
              );
            })}
            {(property.boundary?.length ?? 0) > 1 && (
              <li className="py-2 text-right text-xs text-bark">Property total {formatAcres(totalAcres(property.boundary))}</li>
            )}
          </ul>
        )}
      </section>
      {/* Unsaved outlines: always visible, so a drawn outline can't be left unsaved by accident. */}
      {canManage && (items.length > 0 || saveResult) && (
        <>
          <div className="h-24" aria-hidden />
          <div
            className="fixed inset-x-0 bottom-[60px] z-[1001] px-3 pb-2 md:bottom-0"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="mx-auto max-w-2xl space-y-2 rounded-2xl border border-line bg-white p-3 shadow-lg">
              {saveResult && (
                <p className={`flex items-start gap-1 text-sm ${saveResult.ok ? "text-forest-dark" : "text-red-700"}`}>
                  <Icon name={saveResult.ok ? "check_circle" : "error"} className="text-[18px]" />
                  <span className="flex-1">{saveResult.text}</span>
                  <button type="button" className="text-bark" aria-label="Dismiss" onClick={() => setSaveResult(null)}>
                    <Icon name="close" className="text-[18px]" />
                  </button>
                </p>
              )}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-semibold text-amber-800">
                    {items.length} outline{items.length === 1 ? "" : "s"} not saved yet
                  </span>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || !dbReady || items.every((i) => i.assign === "skip")}
                    onClick={save}
                  >
                    <Icon name="save" /> {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
